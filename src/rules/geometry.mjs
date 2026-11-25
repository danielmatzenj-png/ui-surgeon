/**
 * Spatial & geometric layout rules:
 * - horizontal-overflow
 * - element-overlap
 * - text-clipping
 * - hit-test-occlusion
 * - touch-target-size
 */

function intersectionArea(a, b) {
  const xOverlap = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

export const geometryRules = [
  {
    id: 'horizontal-overflow',
    category: 'geometry',
    severity: 'critical',
    wcag: '1.4.10 Reflow (AA)',
    description: 'Detects page-level horizontal overflow and pinpoints offending elements.',
    run(ctx) {
      const findings = [];
      const { probe } = ctx;
      const vw = ctx.viewport.width;
      const overflowX = Math.max(probe.document.overflowX, probe.document.scrollWidth - vw);

      if (overflowX > 2) {
        const offenders = probe.elements
          .filter((el) => el.pageRect.right > vw + 2 && el.position !== 'fixed')
          .sort((a, b) => b.pageRect.right - a.pageRect.right);

        // Deduplicate: keep leaf-most or worst offenders (skip ancestors of already captured offenders)
        const reported = [];
        for (const el of offenders) {
          const isAncestorOfReported = reported.some((r) => r.ancestorSelectors.includes(el.selector));
          if (isAncestorOfReported) continue;
          reported.push(el);
          if (reported.length >= 6) break;
        }

        if (reported.length === 0) {
          findings.push({
            ruleId: 'horizontal-overflow',
            severity: 'critical',
            category: 'geometry',
            wcag: '1.4.10',
            selector: 'html',
            message: `Document overflows viewport horizontally by ${Math.round(overflowX)}px (scrollWidth ${probe.document.scrollWidth}px > ${vw}px).`,
            evidence: { overflowPx: Math.round(overflowX), viewportWidth: vw },
            fix: 'Check fixed widths, negative margins, or wide flex/grid children; add `min-width: 0` on flex/grid items and `max-width: 100%` on media.',
          });
        } else {
          for (const el of reported) {
            const overflowPx = Math.round(el.pageRect.right - vw);
            findings.push({
              ruleId: 'horizontal-overflow',
              severity: 'critical',
              category: 'geometry',
              wcag: '1.4.10',
              selector: el.selector,
              rect: el.rect,
              message: `Element overflows viewport right edge by +${overflowPx}px (${Math.round(el.pageRect.right)}px > ${vw}px).`,
              evidence: {
                overflowPx,
                elementRight: el.pageRect.right,
                elementWidth: el.rect.width,
                viewportWidth: vw,
              },
              fix: `Constrain \`${el.selector}\` with \`max-width: 100%; box-sizing: border-box;\` or use responsive wrapping (\`flex-wrap: wrap\` / \`grid-template-columns: repeat(auto-fit, minmax(0, 1fr))\`).`,
            });
          }
        }
      }
      return findings;
    },
  },

  {
    id: 'hit-test-occlusion',
    category: 'geometry',
    severity: 'critical',
    wcag: '2.4.11 Focus Not Obscured (AA)',
    description: 'Detects interactive elements blocked from clicks by overlapping elements.',
    run(ctx) {
      const findings = [];
      for (const el of ctx.probe.elements) {
        if (!el.interactive || !el.occludedBy) continue;
        findings.push({
          ruleId: 'hit-test-occlusion',
          severity: 'critical',
          category: 'geometry',
          wcag: '2.4.11',
          selector: el.selector,
          rect: el.rect,
          message: `Interactive <${el.tag}> "${el.text || el.accessibleName}" is covered at its center by ${el.occludedBy.selector} (${el.occludedBy.position}, z-index: ${el.occludedBy.zIndex}).`,
          evidence: { occludedBy: el.occludedBy },
          fix: `Adjust spacing, \`scroll-margin-top\`, or z-index layering so \`${el.occludedBy.selector}\` does not cover \`${el.selector}\`.`,
        });
      }
      return findings;
    },
  },

  {
    id: 'element-overlap',
    category: 'geometry',
    severity: 'high',
    wcag: '1.4.10 Reflow (AA)',
    description: 'Detects unintended bounding-box collisions between sibling/unrelated interactive or text elements.',
    run(ctx) {
      const findings = [];
      const candidates = ctx.probe.elements.filter(
        (el) =>
          (el.interactive || el.directText) &&
          el.pointerEvents !== 'none' &&
          el.position !== 'fixed' &&
          el.position !== 'sticky' &&
          el.rect.width >= 10 &&
          el.rect.height >= 10
      );

      const seenPairs = new Set();
      for (let i = 0; i < candidates.length; i++) {
        const a = candidates[i];
        for (let j = i + 1; j < candidates.length; j++) {
          const b = candidates[j];
          // Quick Y-axis rejection
          if (a.pageRect.bottom <= b.pageRect.y + 2 || b.pageRect.bottom <= a.pageRect.y + 2) {
            continue;
          }
          if (a.pageRect.right <= b.pageRect.x + 2 || b.pageRect.right <= a.pageRect.x + 2) {
            continue;
          }
          // Skip ancestor/descendant relationships
          if (a.ancestorSelectors.includes(b.selector) || b.ancestorSelectors.includes(a.selector)) {
            continue;
          }
          const area = intersectionArea(a.pageRect, b.pageRect);
          const minArea = Math.min(
            a.pageRect.width * a.pageRect.height,
            b.pageRect.width * b.pageRect.height
          );
          const ratio = minArea > 0 ? area / minArea : 0;
          if (area >= 48 && ratio >= 0.12) {
            const pairKey = [a.selector, b.selector].sort().join('||');
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            findings.push({
              ruleId: 'element-overlap',
              severity: 'high',
              category: 'geometry',
              wcag: '1.4.10',
              selector: a.selector,
              rect: a.rect,
              message: `Element overlaps \`${b.selector}\` by ${Math.round(area)}px² (${Math.round(ratio * 100)}% of smaller element).`,
              evidence: {
                otherSelector: b.selector,
                overlapAreaPx2: Math.round(area),
                overlapRatio: Math.round(ratio * 100) / 100,
              },
              fix: `Remove negative margins or conflicting absolute positioning between \`${a.selector}\` and \`${b.selector}\`; use flex/grid \`gap\`.`,
            });
            if (findings.length >= 12) return findings;
          }
        }
      }
      return findings;
    },
  },

  {
    id: 'text-clipping',
    category: 'geometry',
    severity: 'high',
    wcag: '1.4.4 Resize Text (AA)',
    description: 'Detects text silently truncated or clipped by overflow:hidden/clip containers.',
    run(ctx) {
      const findings = [];
      for (const el of ctx.probe.elements) {
        if (!el.directText && !el.interactive) continue;
        if (!el.clipsX && !el.clipsY) continue;
        // Intentional single-line ellipsis on non-heading, non-button text is downgraded/ignored
        const intentionalEllipsis =
          el.textOverflow === 'ellipsis' &&
          el.whiteSpace === 'nowrap' &&
          !el.interactive &&
          !/^h[1-6]$/.test(el.tag);
        if (intentionalEllipsis) continue;

        const clipAxis = el.clipsX && el.clipsY ? 'X+Y' : el.clipsX ? 'horizontal' : 'vertical';
        const deltaX = Math.max(0, el.scrollWidth - el.clientWidth);
        const deltaY = Math.max(0, el.scrollHeight - el.clientHeight);
        findings.push({
          ruleId: 'text-clipping',
          severity: el.interactive || /^h[1-6]$/.test(el.tag) ? 'high' : 'medium',
          category: 'geometry',
          wcag: '1.4.4',
          selector: el.selector,
          rect: el.rect,
          message: `Text "${el.text.slice(0, 40)}" clipped (${clipAxis}: +${deltaX}px W, +${deltaY}px H hidden).`,
          evidence: {
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
          },
          fix: `Replace fixed \`height\`/\`width\` with \`min-height\` or allow wrapping (\`white-space: normal; overflow-wrap: anywhere;\`).`,
        });
      }
      return findings;
    },
  },

  {
    id: 'touch-target-size',
    category: 'geometry',
    severity: 'medium',
    wcag: '2.5.8 Target Size (Minimum, WCAG 2.2 AA)',
    description: 'Checks interactive elements meet WCAG 2.2 24x24px minimum and 44x44px mobile touch standard.',
    run(ctx) {
      const findings = [];
      const isMobile = ctx.viewport.width <= 480;
      const minRequired = isMobile ? 44 : 24;

      for (const el of ctx.probe.elements) {
        if (!el.interactive) continue;
        // Inline text links inside paragraphs are exempt under WCAG 2.5.8
        if (el.tag === 'a' && el.rect.height < 24 && el.parentSelector.includes('p')) continue;

        const w = Math.round(el.rect.width);
        const h = Math.round(el.rect.height);
        if (w < 24 || h < 24) {
          findings.push({
            ruleId: 'touch-target-size',
            severity: 'high',
            category: 'geometry',
            wcag: '2.5.8',
            selector: el.selector,
            rect: el.rect,
            message: `Interactive target is ${w}x${h}px (fails WCAG 2.2 AA 24x24px minimum).`,
            evidence: { width: w, height: h, minimumPx: 24 },
            fix: `Add padding or \`min-width: ${minRequired}px; min-height: ${minRequired}px;\` to \`${el.selector}\`.`,
          });
        } else if (isMobile && (w < 44 || h < 44)) {
          findings.push({
            ruleId: 'touch-target-size',
            severity: 'medium',
            category: 'geometry',
            wcag: '2.5.5',
            selector: el.selector,
            rect: el.rect,
            message: `Mobile touch target is ${w}x${h}px (below 44x44px recommended touch area).`,
            evidence: { width: w, height: h, recommendedPx: 44 },
            fix: `Increase hit area of \`${el.selector}\` to at least \`44x44px\` on mobile viewports.`,
          });
        }
      }
      return findings;
    },
  },
];
