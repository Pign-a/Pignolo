// Finds the installed Chrome or Edge (spec §11.1, A-07). Never downloads anything.
// findBrowser({ platform, env, exists }) -> { path, source: 'env' | 'standard' } | { path: null, reason }
// PIGNOLO_UI_BROWSER forces the path; when it points to a missing file the answer is a reason,
// not another browser (the user asked for that one).
import fs from 'node:fs';
import path from 'node:path';

const fileExists = (p) => {
  try { return fs.statSync(p).isFile(); } catch { return false; }
};

const WINDOWS = [
  ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
  ['Google', 'Chrome', 'Application', 'chrome.exe'],
];
const MAC = [
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];
const LINUX = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable'];

function candidates(platform, env) {
  if (platform === 'win32') {
    const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA].filter(Boolean);
    return WINDOWS.flatMap((parts) => roots.map((r) => path.win32.join(r, ...parts)));
  }
  if (platform === 'darwin') return MAC;
  const dirs = String(env.PATH ?? '').split(':').filter(Boolean);
  return LINUX.flatMap((name) => dirs.map((d) => path.posix.join(d, name)));
}

export function findBrowser({ platform = process.platform, env = process.env, exists = fileExists } = {}) {
  const forced = env.PIGNOLO_UI_BROWSER;
  if (forced) return exists(forced) ? { path: forced, source: 'env' } : { path: null, reason: `PIGNOLO_UI_BROWSER points to a missing file: ${forced}` };
  const found = candidates(platform, env).find((p) => exists(p));
  return found ? { path: found, source: 'standard' } : { path: null, reason: 'no Chrome or Edge found (set PIGNOLO_UI_BROWSER)' };
}
