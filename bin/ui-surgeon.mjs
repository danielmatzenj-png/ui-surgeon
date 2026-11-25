#!/usr/bin/env node
/**
 * UI Surgeon CLI — Closed-loop visual geometry, pixel-verified contrast, and WCAG 2.2 surgeon.
 * Zero runtime dependencies (Node >= 22).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTIN_RULES, formatMarkdown, formatSarif, runAudit } from '../src/index.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, '..');

const SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

function printHelp() {
  console.log(`ui-surgeon v1.0.0 — Closed-Loop Visual Geometry, Contrast & WCAG 2.2 Surgeon

USAGE:
  ui-surgeon <url | html-file | build-dir> [options]
  ui-surgeon --install-skill [--project]
  ui-surgeon --list-rules

OPTIONS:
  --viewports <list>     Comma-separated presets or WxH (default: mobile,tablet,desktop)
  --dark-mode            Audit both prefers-color-scheme: light and dark
  --color-scheme <mode>  Single scheme: light or dark (default: light)
  --annotate             Save annotated PNG screenshots highlighting every defect
  --out <dir>            Output directory for report.json and annotated PNGs
  --baseline <file>      Compare against previous report.json to track fixes & regressions
  --format <fmt>         Output format: md (default), json, sarif
  --fail-on <severity>   Exit code 1 if findings >= severity (critical|high|medium|low)
  --rules-dir <dir>      Load custom community rule modules (.mjs/.js)
  --only <ids>           Comma-separated rule IDs or categories to run
  --ignore <ids>         Comma-separated rule IDs or categories to skip
  --wait <ms>            Extra settle wait after load (default: 0)
  --skip-focus           Skip real keyboard Tab focus audit
  --chrome <path>        Explicit path to Chrome/Chromium executable
  --install-skill        Install the Claude Code skill into ~/.claude/skills/ui-surgeon
  --project              With --install-skill, install into ./.claude/skills/ui-surgeon
  --list-rules           List all built-in deterministic audit rules
  -h, --help             Show this help`);
}

function parseArgs(argv) {
  const opts = {
    target: null,
    viewports: 'mobile,tablet,desktop',
    darkMode: false,
    colorScheme: 'light',
    annotate: false,
    out: null,
    baseline: null,
    format: 'md',
    failOn: null,
    rulesDir: null,
    only: null,
    ignore: null,
    waitMs: 0,
    skipFocus: false,
    chromePath: null,
    installSkill: false,
    project: false,
    listRules: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') opts.help = true;
    else if (arg === '--dark-mode') opts.darkMode = true;
    else if (arg === '--annotate') opts.annotate = true;
    else if (arg === '--skip-focus') opts.skipFocus = true;
    else if (arg === '--install-skill') opts.installSkill = true;
    else if (arg === '--project') opts.project = true;
    else if (arg === '--list-rules') opts.listRules = true;
    else if (arg === '--viewports') opts.viewports = argv[++i];
    else if (arg === '--color-scheme') opts.colorScheme = argv[++i];
    else if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--baseline') opts.baseline = argv[++i];
    else if (arg === '--format') opts.format = argv[++i];
    else if (arg === '--fail-on') opts.failOn = argv[++i];
    else if (arg === '--rules-dir') opts.rulesDir = argv[++i];
    else if (arg === '--only') opts.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--ignore') opts.ignore = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--wait') opts.waitMs = parseInt(argv[++i], 10) || 0;
    else if (arg === '--chrome') opts.chromePath = argv[++i];
    else if (!arg.startsWith('-') && !opts.target) opts.target = arg;
    else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

function installSkill(isProject) {
  const srcSkill = path.join(PKG_ROOT, 'skills', 'ui-surgeon');
  const destBase = isProject
    ? path.resolve(process.cwd(), '.claude', 'skills', 'ui-surgeon')
    : path.join(os.homedir(), '.claude', 'skills', 'ui-surgeon');

  copyDirRecursive(srcSkill, destBase);

  // Also bundle the zero-dep CLI runner into the installed skill's scripts/ so it runs standalone
  const scriptsDest = path.join(destBase, 'scripts');
  fs.mkdirSync(scriptsDest, { recursive: true });
  copyDirRecursive(path.join(PKG_ROOT, 'src'), path.join(scriptsDest, 'src'));
  fs.copyFileSync(path.join(PKG_ROOT, 'bin', 'ui-surgeon.mjs'), path.join(scriptsDest, 'ui-surgeon.mjs'));
  // Patch relative import inside standalone scripts/ui-surgeon.mjs
  const cliPath = path.join(scriptsDest, 'ui-surgeon.mjs');
  const patched = fs
    .readFileSync(cliPath, 'utf8')
    .replace("'../src/index.mjs'", "'./src/index.mjs'");
  fs.writeFileSync(cliPath, patched);

  console.log(`Installed ui-surgeon skill to: ${destBase}`);
  console.log('Invoke in Claude Code via: /ui-surgeon <url|path>');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  if (opts.listRules) {
    console.log('| Rule ID | Category | Default Severity | Standard | Description |');
    console.log('| --- | --- | --- | --- | --- |');
    for (const r of BUILTIN_RULES) {
      console.log(`| \`${r.id}\` | ${r.category} | ${r.severity} | ${r.wcag} | ${r.description} |`);
    }
    process.exit(0);
  }

  if (opts.installSkill) {
    installSkill(opts.project);
    process.exit(0);
  }

  if (!opts.target) {
    printHelp();
    process.exit(2);
  }

  const report = await runAudit(opts.target, {
    viewports: opts.viewports,
    darkMode: opts.darkMode,
    colorScheme: opts.colorScheme,
    annotate: opts.annotate,
    out: opts.out,
    baseline: opts.baseline,
    rulesDir: opts.rulesDir,
    only: opts.only,
    ignore: opts.ignore,
    waitMs: opts.waitMs,
    skipFocus: opts.skipFocus,
    chromePath: opts.chromePath,
  });

  if (opts.format === 'json') {
    console.log(JSON.stringify(report, null, 2));
  } else if (opts.format === 'sarif') {
    console.log(formatSarif(report));
  } else {
    console.log(formatMarkdown(report));
  }

  if (opts.failOn) {
    const threshold = SEVERITY_RANK[opts.failOn.toLowerCase()];
    if (!threshold) {
      throw new Error(`Invalid --fail-on value "${opts.failOn}". Use critical, high, medium, or low.`);
    }
    const failing = report.findings.some((f) => (SEVERITY_RANK[f.severity] || 0) >= threshold);
    if (failing) process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[ui-surgeon] ERROR: ${err.message}`);
  process.exit(2);
});
