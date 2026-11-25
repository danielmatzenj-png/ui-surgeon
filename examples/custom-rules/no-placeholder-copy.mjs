/**
 * Example external community rule for UI Surgeon.
 * Load via: ui-surgeon http://localhost:3000 --rules-dir ./examples/custom-rules
 */

export default {
  id: 'no-placeholder-copy',
  category: 'content',
  severity: 'medium',
  wcag: 'Production Readiness',
  description: 'Flags leftover Lorem Ipsum or TODO placeholder strings visible in the DOM.',
  run(ctx) {
    const pattern = /\b(lorem ipsum|dolor sit amet|TODO:|TBD|FIXME)\b/i;
    const findings = [];
    for (const el of ctx.probe.elements) {
      if (!el.directText || !el.text) continue;
      if (pattern.test(el.text)) {
        findings.push({
          ruleId: 'no-placeholder-copy',
          severity: 'medium',
          category: 'content',
          wcag: 'Production Readiness',
          selector: el.selector,
          rect: el.rect,
          message: `Placeholder copy detected: "${el.text.slice(0, 50)}"`,
          evidence: { text: el.text },
          fix: `Replace placeholder copy in \`${el.selector}\` with real product copy.`,
        });
      }
    }
    return findings;
  },
};
