import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffAgainstBaseline, formatMarkdown, formatSarif, runAudit } from '../src/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BROKEN_FIXTURE = path.join(__dirname, 'fixtures', 'broken-landing.html');
const CLEAN_FIXTURE = path.join(__dirname, 'fixtures', 'clean-landing.html');
const CUSTOM_RULES_DIR = path.join(__dirname, '..', 'examples', 'custom-rules');

test('audits broken-landing.html and catches geometry, pixel-sampled contrast, focus, and a11y defects', async () => {
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-surgeon-test-'));
  try {
    const report = await runAudit(BROKEN_FIXTURE, {
      viewports: 'mobile,desktop',
      annotate: true,
      out: tmpOut,
    });

    const ruleIds = new Set(report.findings.map((f) => f.ruleId));

    assert.ok(ruleIds.has('horizontal-overflow'), 'should catch mobile horizontal overflow');
    const overflowFinding = report.findings.find((f) => f.ruleId === 'horizontal-overflow');
    assert.ok(
      overflowFinding.selector.includes('pricing-banner'),
      `should pinpoint offending element .pricing-banner, got ${overflowFinding.selector}`
    );
    assert.ok(ruleIds.has('hit-test-occlusion'), 'should catch sticky header occluding CTA');
    assert.ok(ruleIds.has('text-clipping'), 'should catch clipped fixed-height card');
    assert.ok(ruleIds.has('wcag-contrast'), 'should catch WCAG contrast failures');
    assert.ok(ruleIds.has('touch-target-size'), 'should catch 18x18px touch target');
    assert.ok(ruleIds.has('missing-accessible-name'), 'should catch icon-only button without label');
    assert.ok(ruleIds.has('missing-form-label'), 'should catch unlabeled email input');
    assert.ok(ruleIds.has('clickable-non-interactive'), 'should catch clickable div');
    assert.ok(ruleIds.has('duplicate-id'), 'should catch duplicate DOM id');
    assert.ok(ruleIds.has('heading-hierarchy'), 'should catch h1 -> h4 skip');
    assert.ok(ruleIds.has('broken-image'), 'should catch broken 404 image');
    assert.ok(ruleIds.has('unreadable-font-size'), 'should catch 9px micro text');
    assert.ok(ruleIds.has('focus-visibility'), 'should catch missing focus outline via Tab dispatch');

    // Verify pixel-sampled contrast worked on the gradient hero subtitle!
    const pixelContrast = report.findings.find(
      (f) => f.ruleId === 'wcag-contrast' && f.evidence?.method === 'pixel-sampled'
    );
    assert.ok(pixelContrast, 'should verify gradient contrast via PNG pixel sampling');

    // Verify annotated screenshots were generated
    assert.equal(report.screenshots.length, 2);
    for (const s of report.screenshots) {
      assert.ok(fs.existsSync(s.path), `missing annotated screenshot ${s.path}`);
    }

    // Verify Markdown & SARIF formatters
    const md = formatMarkdown(report);
    assert.ok(md.includes('# UI Surgeon Report'));
    const sarif = JSON.parse(formatSarif(report));
    assert.equal(sarif.version, '2.1.0');
    assert.ok(sarif.runs[0].results.length > 0);
  } finally {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('audits clean-landing.html and achieves score 100/100 with 0 defects and 0 regressions', async () => {
  const brokenReport = await runAudit(BROKEN_FIXTURE, { viewports: 'mobile,desktop' });
  const cleanReport = await runAudit(CLEAN_FIXTURE, { viewports: 'mobile,desktop' });

  assert.equal(
    cleanReport.findings.length,
    0,
    `Expected 0 findings on clean fixture, got: ${JSON.stringify(cleanReport.findings, null, 2)}`
  );
  assert.equal(cleanReport.summary.score, 100);
  assert.equal(cleanReport.summary.passed, true);

  const diff = diffAgainstBaseline(cleanReport.findings, brokenReport);
  assert.equal(diff.introducedCount, 0);
  assert.equal(diff.remainingCount, 0);
  assert.ok(diff.fixedCount >= 15);
});

test('loads external community rules from --rules-dir', async () => {
  const report = await runAudit(CLEAN_FIXTURE, {
    viewports: 'desktop',
    rulesDir: CUSTOM_RULES_DIR,
  });
  assert.equal(report.summary.score, 100);
});
