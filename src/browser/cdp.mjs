/**
 * Zero-dependency headless Chromium launcher + Chrome DevTools Protocol (CDP)
 * client powered by Node 22+'s native WebSocket and fetch APIs.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

export function findChromeExecutable(explicitPath) {
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;
  if (process.env.UI_SURGEON_CHROME && fs.existsSync(process.env.UI_SURGEON_CHROME)) {
    return process.env.UI_SURGEON_CHROME;
  }

  const platform = process.platform;
  const candidates = [];

  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Arc.app/Contents/MacOS/Arc'
    );
  } else if (platform === 'linux') {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/brave-browser'
    );
  } else if (platform === 'win32') {
    const localApp = process.env.LOCALAPPDATA || '';
    const pf = process.env['PROGRAMFILES'] || 'C:\\Program Files';
    const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
    candidates.push(
      path.join(pf, 'Google/Chrome/Application/chrome.exe'),
      path.join(pf86, 'Google/Chrome/Application/chrome.exe'),
      path.join(localApp, 'Google/Chrome/Application/chrome.exe'),
      path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(pf86, 'Microsoft/Edge/Application/msedge.exe')
    );
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Fallback: check Playwright's cached Chromium if present on machine
  const home = os.homedir();
  const pwRoots = [
    path.join(home, 'Library/Caches/ms-playwright'),
    path.join(home, '.cache/ms-playwright'),
  ];
  for (const root of pwRoots) {
    if (!fs.existsSync(root)) continue;
    const dirs = fs.readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse();
    for (const dir of dirs) {
      const macBin = path.join(root, dir, 'chrome-mac/Chromium.app/Contents/MacOS/Chromium');
      const macArmBin = path.join(root, dir, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
      const linuxBin = path.join(root, dir, 'chrome-linux/chrome');
      for (const b of [macArmBin, macBin, linuxBin]) {
        if (fs.existsSync(b)) return b;
      }
    }
  }

  throw new Error(
    'No Chromium-based browser found. Install Google Chrome/Chromium or set UI_SURGEON_CHROME=/path/to/chrome.'
  );
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

export class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    if (typeof WebSocket === 'undefined') {
      throw new Error('UI Surgeon requires Node.js >= 22 (built-in WebSocket).');
    }
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', (err) => reject(err), { once: true });
      ws.addEventListener('message', (event) => {
        const msg = JSON.parse(String(event.data));
        if (msg.id !== undefined) {
          const entry = this.pending.get(msg.id);
          if (entry) {
            this.pending.delete(msg.id);
            if (msg.error) {
              entry.reject(new Error(`CDP ${entry.method}: ${msg.error.message}`));
            } else {
              entry.resolve(msg.result);
            }
          }
        } else if (msg.method) {
          const handlers = this.listeners.get(msg.method);
          if (handlers) {
            for (const fn of handlers) fn(msg.params);
          }
        }
      });
      ws.addEventListener('close', () => {
        for (const [, entry] of this.pending) {
          entry.reject(new Error('CDP WebSocket closed unexpectedly'));
        }
        this.pending.clear();
      });
    });
  }

  send(method, params = {}, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout after ${timeoutMs}ms on ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        method,
        resolve: (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(handler);
    return () => this.listeners.get(method)?.delete(handler);
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      const text =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'Runtime evaluation error';
      throw new Error(text);
    }
    return res.result?.value;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
  }
}

export async function launchBrowser({ chromePath, timeoutMs = 15000 } = {}) {
  const executable = findChromeExecutable(chromePath);
  const port = await getFreePort();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-surgeon-chrome-'));

  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-extensions',
    '--disable-sync',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    'about:blank',
  ];

  const proc = spawn(executable, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  proc.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const deadline = Date.now() + timeoutMs;
  let pageWsUrl = null;

  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`Chrome exited early (${proc.exitCode}): ${stderr.slice(0, 500)}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (res.ok) {
        const targets = await res.json();
        const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          pageWsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {
      // Chrome still booting
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  if (!pageWsUrl) {
    proc.kill('SIGKILL');
    throw new Error(`Timed out waiting for Chrome DevTools on port ${port}: ${stderr.slice(0, 400)}`);
  }

  const client = new CdpClient(pageWsUrl);
  await client.connect();

  async function close() {
    client.close();
    try {
      proc.stderr?.destroy();
      proc.kill('SIGTERM');
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 100));
    try {
      if (proc.exitCode === null) proc.kill('SIGKILL');
      proc.unref();
    } catch {
      // ignore
    }
    try {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  return { client, close, executable };
}
