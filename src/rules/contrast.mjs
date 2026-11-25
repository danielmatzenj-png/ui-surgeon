/**
 * Pixel-verified + alpha-composited WCAG 2.1 AA/AAA & APCA (WCAG 3.0) contrast rule.
 * Unlike DOM-only auditors (which give up on gradients, glassmorphism, or hero images),
 * UI Surgeon decodes the rendered PNG screenshot to sample actual background pixels.
 */

import {
  apcaContrastLc,
  compositeStack,
  isLargeText,
  parseColor,
  rgbToHex,
  suggestAccessibleColor,
  wcagContrastRatio,
} from '../color/contrast.mjs';
import { sampleBackgroundAroundRect } from '../browser/png.mjs';

export const contrastRules = [
  {
    id: 'wcag-contrast',
    category: 'contrast',
    severity: 'high',
    wcag: '1.4.3 Contrast (Minimum, AA)',
    description:
      'Measures true WCAG 2.1 contrast ratio and APCA Lc via ancestor alpha-compositing and rendered PNG pixel sampling.',
    run(ctx) {
      const findings = [];
      const { probe, screenshotPng, colorScheme } = ctx;
      const defaultCanvas =
        colorScheme === 'dark'
          ? { r: 18, g: 18, b: 18, a: 1 }
          : { r: 255, g: 255, b: 255, a: 1 };
      const parsedRoot = parseColor(probe.document.rootBg);
      const canvas =
        parsedRoot && parsedRoot.a > 0 ? compositeStack([parsedRoot], defaultCanvas) : defaultCanvas;

      const dpr = probe.viewport.dpr || 1;

      for (const el of probe.elements) {
        if (!el.directText || !el.text) continue;
        const fgRaw = parseColor(el.color);
        if (!fgRaw) continue;
        const fg = { ...fgRaw, a: (fgRaw.a ?? 1) * (el.opacity ?? 1) };

        const parsedLayers = (el.bgLayers || [])
          .map((l) => {
            const c = parseColor(l.color);
            return c ? { ...c, a: (c.a ?? 1) * (l.opacity ?? 1) } : null;
          })
          .filter(Boolean);

        let bg = compositeStack(parsedLayers, canvas);
        let method = 'alpha-stack';

        // If element sits over gradient, image, backdrop-filter, or is visible in screenshot,
        // verify with actual rendered PNG pixel sampling!
        const inViewport =
          screenshotPng &&
          el.rect.x >= 0 &&
          el.rect.y >= 0 &&
          el.rect.right <= probe.viewport.width &&
          el.rect.bottom <= probe.viewport.height;

        if (el.hasComplexBg && inViewport) {
          const sampled = sampleBackgroundAroundRect(screenshotPng, el.rect, fg, dpr);
          if (sampled) {
            bg = sampled;
            method = 'pixel-sampled';
          }
        }

        const ratio = wcagContrastRatio(fg, bg);
        const roundedRatio = Math.round(ratio * 100) / 100;
        const large = isLargeText(el.fontSize, el.fontWeight);
        const required = large ? 3.0 : 4.5;
        const lc = apcaContrastLc(fg, bg);

        if (ratio < required) {
          const suggestion = suggestAccessibleColor(fg, bg, required + 0.15);
          const severity = ratio < 2.5 ? 'critical' : 'high';
          findings.push({
            ruleId: 'wcag-contrast',
            severity,
            category: 'contrast',
            wcag: '1.4.3',
            selector: el.selector,
            rect: el.rect,
            message: `Contrast ${roundedRatio}:1 (APCA Lc ${lc}) fails WCAG AA ${required}:1 for ${large ? 'large' : 'normal'} text "${el.text.slice(0, 36)}" [${method}: ${rgbToHex(fg)} on ${rgbToHex(bg)}].`,
            evidence: {
              ratio: roundedRatio,
              required,
              apcaLc: lc,
              fgHex: rgbToHex(fg),
              bgHex: rgbToHex(bg),
              fontSizePx: el.fontSize,
              fontWeight: el.fontWeight,
              largeText: large,
              method,
              suggestedHex: suggestion.hex,
              suggestedRatio: suggestion.ratio,
            },
            fix: `Change \`color\` on \`${el.selector}\` from \`${rgbToHex(fg)}\` to \`${suggestion.hex}\` (achieves ${suggestion.ratio}:1 while preserving hue).`,
          });
        }
      }

      return findings;
    },
  },
];
