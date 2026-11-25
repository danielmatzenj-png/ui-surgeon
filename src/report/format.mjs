/**
 * Output formatters:
 * - formatMarkdown(): Token-compact report optimized for Claude Code closed-loop surgery
 * - formatSarif(): SARIF 2.1.0 for GitHub Code Scanning / CI security & quality gates
 */

export function formatMarkdown(report) {
  const { summary, matrix, diff, findings, screenshots } = report;
  const lines = [];

  lines.push(`# UI Surgeon Report — Score: ${summary.score}/100`);
  lines.push(
    `**Target:** \`${report.target}\` | **Duration:** ${report.durationMs}ms | ` +
      `**Defects:** ${summary.total} (critical: ${summary.counts.critical}, high: ${summary.counts.high}, medium: ${summary.counts.medium}, low: ${summary.counts.low})`
  );

  lines.push('');
  lines.push('## Matrix');
  lines.push('| Viewport | Scheme | Elements | Tab Stops | CLS | Findings |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: |');
  for (const m of matrix) {
    lines.push(
      `| ${m.viewport} (${m.width}x${m.height}) | ${m.colorScheme} | ${m.elementsScanned} | ${m.tabStopsVisited} | ${m.cls} | ${m.findingCount} |`
    );
  }

  if (diff) {
    lines.push('');
    lines.push('## Baseline Diff');
    lines.push(
      `- Score: ${diff.baselineScore ?? '?'} -> **${summary.score}**` +
        ` | Fixed: **${diff.fixedCount}** | Remaining: **${diff.remainingCount}** | Regressions: **${diff.introducedCount}**`
    );
    if (diff.introduced.length > 0) {
      lines.push('- **REGRESSIONS INTRODUCED (MUST REVERT OR FIX):**');
      for (const r of diff.introduced) {
        lines.push(`  - [${r.severity.toUpperCase()}] \`${r.ruleId}\` @ ${r.viewport} \`${r.selector}\`: ${r.message}`);
      }
    }
  }

  if (findings.length === 0) {
    lines.push('');
    lines.push('## Status');
    lines.push('0 defects found across all audited viewports and color schemes.');
  } else {
    // Group identical (ruleId + selector + message) across viewports to save LLM tokens
    const grouped = new Map();
    for (const f of findings) {
      const key = `${f.severity}|${f.ruleId}|${f.selector}|${f.message}`;
      if (!grouped.has(key)) {
        grouped.set(key, { ...f, viewports: [`${f.viewport}/${f.colorScheme}`] });
      } else {
        const entry = grouped.get(key);
        const vpTag = `${f.viewport}/${f.colorScheme}`;
        if (!entry.viewports.includes(vpTag)) entry.viewports.push(vpTag);
      }
    }

    lines.push('');
    lines.push('## Surgical Prescription (Ranked by Severity)');
    let idx = 1;
    for (const item of grouped.values()) {
      lines.push(
        `${idx}. **[${item.severity.toUpperCase()}] \`${item.ruleId}\`** (${item.wcag}) — \`${item.selector}\` *(${item.viewports.join(', ')})*`
      );
      lines.push(`   - **Observed:** ${item.message}`);
      lines.push(`   - **Fix:** ${item.fix}`);
      idx++;
    }
  }

  if (screenshots.length > 0) {
    lines.push('');
    lines.push('## Annotated Visual Evidence');
    for (const s of screenshots) {
      lines.push(`- ${s.viewport} (${s.colorScheme}): \`${s.path}\``);
    }
  }

  return lines.join('\n');
}

export function formatSarif(report) {
  const levelMap = {
    critical: 'error',
    high: 'error',
    medium: 'warning',
    low: 'note',
  };

  const uniqueRules = new Map();
  for (const f of report.findings) {
    if (!uniqueRules.has(f.ruleId)) {
      uniqueRules.set(f.ruleId, {
        id: f.ruleId,
        shortDescription: { text: `${f.ruleId} (${f.wcag})` },
        properties: { category: f.category, wcag: f.wcag },
      });
    }
  }

  return JSON.stringify(
    {
      $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'ui-surgeon',
              version: report.version,
              informationUri: 'https://github.com/danielmatzenj-png/ui-surgeon',
              rules: Array.from(uniqueRules.values()),
            },
          },
          results: report.findings.map((f) => ({
            ruleId: f.ruleId,
            level: levelMap[f.severity] || 'warning',
            message: {
              text: `[${f.viewport}/${f.colorScheme}] ${f.selector}: ${f.message} Fix: ${f.fix}`,
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: { uri: report.target },
                },
                logicalLocations: [{ name: f.selector, kind: 'element' }],
              },
            ],
          })),
        },
      ],
    },
    null,
    2
  );
}
