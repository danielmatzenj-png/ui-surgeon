/**
 * Core Closed-Loop UI & A11y Surgeon Engine.
 * Runs deterministic multi-viewport + color-scheme audits, pixel-verified contrast,
 * real CDP keyboard Tab focus checks, annotated screenshots, and baseline diffing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../browser/cdp.mjs';
import { decodePng } from '../browser/png.mjs';
import { startStaticServer } from '../browser/static-server.mjs';
import { buildAnnotationScript, DOM_PROBE_EXPRESSION } from './dom-probe.mjs';
import { loadRules } from '../rules/index.mjs';

export const VIEWPORT_PRESETS = {
  mobile: { name: 'mobile', width: 375, height: 812, mobile: true, dpr: 2 },
  tablet: { name: 'tablet', width: 768, height: 1024, mobile: true, dpr: 2 },
  desktop: { name: 'desktop', width: 1440, height: 900, mobile: false, dpr: 1 },
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_PENALTY = { critical: 14, high: 7, medium: 3, low: 1 };

export function parseViewports(spec) {
  if (!spec) return [VIEWPORT_PRESETS.mobile, VIEWPORT_PRESETS.tablet, VIEWPORT_PRESETS.desktop];
  const parts = Array.isArray(spec) ? spec : String(spec).split(',').map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => {
    if (VIEWPORT_PRESETS[p]) return VIEWPORT_PRESETS[p];
    const m = p.match(/^(\d+)x(\d+)$/i);
    if (m) {
      const width = parseInt(m[1], 10);
      const height = parseInt(m[2], 10);
      return { name: `${width}x${height}`, width, height, mobile: width <= 768, dpr: width <= 768 ? 2 : 1 };
    }
    throw new Error(`Unknown viewport preset "${p}". Use mobile, tablet, desktop, or WxH (e.g. 390x844).`);
  });
}

async function runKeyboardFocusAudit(client, maxTabs = 14) {
  // Snapshot unfocused styles of focusable elements, then dispatch real CDP Tab keystrokes
  await client.evaluate(`(() => {
    window.__uiSurgeonUnfocused = new WeakMap();
    const els = document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    for (const el of els) {
      const s = getComputedStyle(el);
      window.__uiSurgeonUnfocused.set(el, {
        outline: s.outlineStyle + ':' + s.outlineWidth + ':' + s.outlineColor,
        boxShadow: s.boxShadow,
        borderColor: s.borderColor,
        backgroundColor: s.backgroundColor,
        textDecoration: s.textDecorationLine
      });
    }
    if (document.activeElement && document.activeElement !== document.body) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  })()`);

  const missingIndicator = [];
  const occludedOnFocus = [];
  const seen = new Set();

  for (let step = 0; step < maxTabs; step++) {
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });
    await client.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
      nativeVirtualKeyCode: 9,
    });

    const info = await client.evaluate(`(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return null;
      const s = getComputedStyle(el);
      const prev = window.__uiSurgeonUnfocused?.get(el);
      const curr = {
        outline: s.outlineStyle + ':' + s.outlineWidth + ':' + s.outlineColor,
        boxShadow: s.boxShadow,
        borderColor: s.borderColor,
        backgroundColor: s.backgroundColor,
        textDecoration: s.textDecorationLine
      };
      const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
      const changed = !prev ||
        prev.outline !== curr.outline ||
        prev.boxShadow !== curr.boxShadow ||
        prev.borderColor !== curr.borderColor ||
        prev.backgroundColor !== curr.backgroundColor ||
        prev.textDecoration !== curr.textDecoration;

      // Check if sticky/fixed header covers active focused element
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let occludedBy = null;
      if (cx >= 0 && cx <= window.innerWidth && cy >= 0 && cy <= window.innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) {
          const ts = getComputedStyle(top);
          if (ts.pointerEvents !== 'none') {
            occludedBy = top.id ? '#' + top.id : top.tagName.toLowerCase() + (typeof top.className === 'string' && top.className.trim() ? '.' + top.className.trim().split(/\\s+/)[0] : '');
          }
        }
      }

      const sel = el.id
        ? '#' + CSS.escape(el.id)
        : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '');

      return {
        selector: sel,
        text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.tagName).trim().slice(0, 50),
        hasVisibleFocus: hasOutline || changed,
        outlineStyle: s.outlineStyle,
        occludedBy,
        rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
      };
    })()`);

    if (!info) break;
    const key = `${info.selector}:${info.rect.x}:${info.rect.y}`;
    if (seen.has(key)) break;
    seen.add(key);

    if (!info.hasVisibleFocus) missingIndicator.push(info);
    if (info.occludedBy) occludedOnFocus.push(info);
  }

  // Reset focus/scroll back to top
  await client.evaluate(`(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    window.scrollTo(0, 0);
  })()`);

  return { tabStopsVisited: seen.size, missingIndicator, occludedOnFocus };
}

export function findingFingerprint(f) {
  return `${f.viewport}|${f.colorScheme}|${f.ruleId}|${f.selector}`;
}

export function diffAgainstBaseline(currentFindings, baselineReport) {
  const prevFindings = baselineReport?.findings || [];
  const prevMap = new Map(prevFindings.map((f) => [findingFingerprint(f), f]));
  const currMap = new Map(currentFindings.map((f) => [findingFingerprint(f), f]));

  const fixed = prevFindings.filter((f) => !currMap.has(findingFingerprint(f)));
  const introduced = currentFindings.filter((f) => !prevMap.has(findingFingerprint(f)));
  const remaining = currentFindings.filter((f) => prevMap.has(findingFingerprint(f)));

  return {
    baselineScore: baselineReport?.summary?.score ?? null,
    fixedCount: fixed.length,
    introducedCount: introduced.length,
    remainingCount: remaining.length,
    fixed: fixed.map((f) => ({ ruleId: f.ruleId, viewport: f.viewport, selector: f.selector })),
    introduced: introduced.map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      viewport: f.viewport,
      selector: f.selector,
      message: f.message,
    })),
  };
}

export async function runAudit(target, options = {}) {
  const startedAt = Date.now();
  const viewports = parseViewports(options.viewports);
  const colorSchemes = options.darkMode ? ['light', 'dark'] : [options.colorScheme || 'light'];
  const rules = await loadRules({
    rulesDir: options.rulesDir,
    only: options.only,
    ignore: options.ignore,
  });

  // Support both http(s) URLs and local HTML files/folders via built-in zero-dep static server
  let targetUrl = target;
  let staticServer = null;
  if (!/^https?:\/\//i.test(target) && !/^file:\/\//i.test(target)) {
    if (!fs.existsSync(target)) {
      throw new Error(`Target path does not exist: ${target}`);
    }
    staticServer = await startStaticServer(target);
    targetUrl = staticServer.url;
  }

  const outDir = options.out ? path.resolve(options.out) : null;
  if (outDir) fs.mkdirSync(outDir, { recursive: true });

  const browser = await launchBrowser({ chromePath: options.chromePath });
  const { client } = browser;

  const allFindings = [];
  const matrixRuns = [];
  const screenshots = [];

  try {
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('Network.enable');

    // Inject CLS observer before document loads
    await client.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `(() => {
        window.__uiSurgeonCLS = 0;
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__uiSurgeonCLS += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
        } catch {}
      })();`,
    });

    for (const colorScheme of colorSchemes) {
      for (const vp of viewports) {
        const consoleErrors = [];
        const failedRequests = [];
        const reqUrls = new Map();

        const offConsole = client.on('Runtime.consoleAPICalled', (p) => {
          if (p.type === 'error') {
            const text = (p.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
            consoleErrors.push({ text, uncaught: false });
          }
        });
        const offException = client.on('Runtime.exceptionThrown', (p) => {
          const d = p.exceptionDetails;
          consoleErrors.push({
            text: d?.exception?.description || d?.text || 'Uncaught exception',
            uncaught: true,
          });
        });
        const offReq = client.on('Network.requestWillBeSent', (p) => {
          reqUrls.set(p.requestId, p.request.url);
        });
        const offResp = client.on('Network.responseReceived', (p) => {
          if (p.response.status >= 400) {
            failedRequests.push({ url: p.response.url, status: p.response.status });
          }
        });
        const offFail = client.on('Network.loadingFailed', (p) => {
          failedRequests.push({
            url: reqUrls.get(p.requestId) || 'unknown',
            status: 0,
            errorText: p.errorText,
          });
        });

        await client.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width,
          height: vp.height,
          deviceScaleFactor: vp.dpr || 1,
          mobile: Boolean(vp.mobile),
        });
        await client.send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: colorScheme }],
        });

        // Navigate & wait for load + settle
        const loadPromise = new Promise((resolve) => {
          const off = client.on('Page.loadEventFired', () => {
            off();
            resolve();
          });
          setTimeout(() => {
            off();
            resolve();
          }, options.timeoutMs || 12000);
        });

        await client.send('Page.navigate', { url: targetUrl });
        await loadPromise;

        // Wait for fonts + animations/layout settle
        await client.evaluate(`(async () => {
          try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch {}
          await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        })()`);
        if (options.waitMs > 0) {
          await new Promise((r) => setTimeout(r, options.waitMs));
        }

        // Capture screenshot for pixel-verified contrast sampling
        let screenshotPng = null;
        try {
          const shot = await client.send('Page.captureScreenshot', { format: 'png' });
          screenshotPng = decodePng(Buffer.from(shot.data, 'base64'));
        } catch {
          // Non-fatal if screenshot fails
        }

        // Run deterministic DOM probe + CLS read
        const probe = await client.evaluate(DOM_PROBE_EXPRESSION);
        const cls = await client.evaluate('window.__uiSurgeonCLS || 0');

        // Run real keyboard Tab focus audit (only once per color scheme on desktop/first viewport to stay fast, or all if requested)
        const focusAudit = options.skipFocus ? null : await runKeyboardFocusAudit(client);

        offConsole();
        offException();
        offReq();
        offResp();
        offFail();

        const ctx = {
          target,
          url: targetUrl,
          viewport: vp,
          colorScheme,
          probe,
          screenshotPng,
          focusAudit,
          runtime: { consoleErrors, failedRequests, cls },
        };

        const runFindings = [];
        for (const rule of rules) {
          const emitted = await rule.run(ctx);
          for (const f of emitted || []) {
            runFindings.push({
              ...f,
              viewport: vp.name,
              viewportWidth: vp.width,
              colorScheme,
            });
          }
        }

        runFindings.sort(
          (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
        );
        allFindings.push(...runFindings);

        // Save annotated screenshot if requested
        if (options.annotate && outDir) {
          await client.evaluate(buildAnnotationScript(runFindings));
          const annShot = await client.send('Page.captureScreenshot', { format: 'png' });
          const fname = `annotated-${vp.name}-${colorScheme}.png`;
          const fpath = path.join(outDir, fname);
          fs.writeFileSync(fpath, Buffer.from(annShot.data, 'base64'));
          screenshots.push({ viewport: vp.name, colorScheme, path: fpath });
        }

        matrixRuns.push({
          viewport: vp.name,
          width: vp.width,
          height: vp.height,
          colorScheme,
          elementsScanned: probe.elements.length,
          tabStopsVisited: focusAudit?.tabStopsVisited ?? 0,
          cls: Math.round(cls * 1000) / 1000,
          findingCount: runFindings.length,
        });
      }
    }
  } finally {
    await browser.close();
    if (staticServer) await staticServer.close();
  }

  // Sort globally by severity
  allFindings.sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of allFindings) {
    if (counts[f.severity] !== undefined) counts[f.severity]++;
  }

  // Deterministic health score (0-100) weighted by unique defects per viewport matrix
  const rawPenalty =
    counts.critical * SEVERITY_PENALTY.critical +
    counts.high * SEVERITY_PENALTY.high +
    counts.medium * SEVERITY_PENALTY.medium +
    counts.low * SEVERITY_PENALTY.low;
  const normalizedPenalty = rawPenalty / Math.max(1, Math.sqrt(matrixRuns.length));
  const score = Math.max(0, Math.round(100 - normalizedPenalty));

  let diff = null;
  if (options.baseline && fs.existsSync(options.baseline)) {
    const prev = JSON.parse(fs.readFileSync(options.baseline, 'utf8'));
    diff = diffAgainstBaseline(allFindings, prev);
  }

  const report = {
    tool: 'ui-surgeon',
    version: '1.0.0',
    target,
    auditedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    summary: {
      score,
      total: allFindings.length,
      counts,
      passed: counts.critical === 0 && counts.high === 0,
    },
    matrix: matrixRuns,
    diff,
    screenshots,
    findings: allFindings,
  };

  if (outDir) {
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  }

  return report;
}
