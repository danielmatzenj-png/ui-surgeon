/**
 * Runtime health rules captured directly from CDP Network, Runtime, and PerformanceObserver:
 * - console-error
 * - failed-network-asset
 * - layout-shift
 */

export const runtimeRules = [
  {
    id: 'console-error',
    category: 'runtime',
    severity: 'high',
    wcag: 'Runtime Integrity',
    description: 'Captures JavaScript console.error messages and uncaught exceptions during page render.',
    run(ctx) {
      const seen = new Set();
      const findings = [];
      for (const err of ctx.runtime.consoleErrors || []) {
        const key = err.text.slice(0, 120);
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          ruleId: 'console-error',
          severity: err.uncaught ? 'critical' : 'high',
          category: 'runtime',
          wcag: 'Runtime',
          selector: 'window',
          message: `${err.uncaught ? 'Uncaught exception' : 'Console error'}: ${err.text.slice(0, 160)}`,
          evidence: err,
          fix: 'Resolve the runtime JavaScript error or hydration mismatch before shipping.',
        });
      }
      return findings.slice(0, 10);
    },
  },

  {
    id: 'failed-network-asset',
    category: 'runtime',
    severity: 'high',
    wcag: 'Runtime Integrity',
    description: 'Detects 4xx/5xx HTTP responses or aborted network requests for page assets.',
    run(ctx) {
      const seen = new Set();
      const findings = [];
      for (const req of ctx.runtime.failedRequests || []) {
        if (req.url.endsWith('/favicon.ico')) continue;
        const key = `${req.status}:${req.url}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          ruleId: 'failed-network-asset',
          severity: req.status >= 500 || req.status === 0 ? 'critical' : 'high',
          category: 'runtime',
          wcag: 'Runtime',
          selector: 'document',
          message: `Failed asset request (${req.status || req.errorText}): ${req.url}`,
          evidence: req,
          fix: `Fix or remove the broken asset URL: ${req.url}`,
        });
      }
      return findings.slice(0, 10);
    },
  },

  {
    id: 'layout-shift',
    category: 'runtime',
    severity: 'medium',
    wcag: 'Core Web Vitals (CLS)',
    description: 'Flags Cumulative Layout Shift (CLS) above 0.1 during page load.',
    run(ctx) {
      const cls = ctx.runtime.cls ?? 0;
      if (cls <= 0.1) return [];
      return [
        {
          ruleId: 'layout-shift',
          severity: cls > 0.25 ? 'high' : 'medium',
          category: 'runtime',
          wcag: 'CLS',
          selector: 'document',
          message: `Cumulative Layout Shift is ${cls.toFixed(3)} (threshold <= 0.100).`,
          evidence: { cls: Math.round(cls * 1000) / 1000 },
          fix: 'Reserve explicit `width`/`height` or `aspect-ratio` on images, embeds, and late-loading banners.',
        },
      ];
    },
  },
];
