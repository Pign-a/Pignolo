// The single routing table shared by the script and the auditor (spec §5.5).
//
// routeFile(relPath) -> { ext, markup, utilities, style, unsupported }
//   ext         lowercase, without the dot ('' when the file has none)
//   markup      'html' | 'jsx' | null
//   utilities   'markup' (class/className attributes) | 'sfc' (.vue/.svelte text) | null
//   style       'css' (the whole file) | 'embedded' (<style> blocks) | null
//   unsupported 'unsupported extension .<ext>' or null
//
// .vue/.svelte: markup rules are reported by the runner as
// "unverified (unsupported extension .vue)" (markup is null, unsupported is null).
import path from 'node:path';

const ROUTES = {
  html: { markup: 'html', utilities: 'markup', style: 'embedded' },
  htm: { markup: 'html', utilities: 'markup', style: 'embedded' },
  jsx: { markup: 'jsx', utilities: 'markup', style: 'embedded' },
  tsx: { markup: 'jsx', utilities: 'markup', style: 'embedded' },
  css: { markup: null, utilities: null, style: 'css' },
  vue: { markup: null, utilities: 'sfc', style: 'embedded' },
  svelte: { markup: null, utilities: 'sfc', style: 'embedded' },
};

export function routeFile(relPath) {
  const ext = path.extname(String(relPath)).slice(1).toLowerCase();
  const route = ROUTES[ext];
  if (route) return { ext, ...route, unsupported: null };
  return { ext, markup: null, utilities: null, style: null, unsupported: `unsupported extension .${ext}` };
}
