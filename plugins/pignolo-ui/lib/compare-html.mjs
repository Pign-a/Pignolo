// compare.html (spec §13): a self-contained local page, one row per option and one iframe per
// screen, so the user can compare and click through the flow. No scripts, no remote resources.
//
// buildCompareHtml({ options: [{ id, screens }], kind, platform, title }) -> string
// openFile(file, { platform, spawn }) -> void     explorer.exe | open | xdg-open, never through a shell
import { spawn as nodeSpawn } from 'node:child_process';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SIZES = {
  desktop: [{ w: 1440, h: 900 }],
  mobile: [{ w: 375, h: 812 }],
  both: [{ w: 1440, h: 900 }, { w: 375, h: 812 }],
};

export function buildCompareHtml({ options, kind = 'option', platform = 'desktop', title = 'Comparación' }) {
  const sizes = SIZES[platform];
  if (!sizes) throw new Error(`platform must be desktop, mobile or both, got ${platform}`);
  const label = kind === 'direction' ? 'Dirección' : 'Opción';
  const rows = options.map((opt) => {
    const figures = opt.screens.map((screen) => sizes.map((s) => `<figure>
<figcaption>${esc(screen)} · ${s.w}</figcaption>
<iframe src="${esc(`${kind}-${opt.id}/${screen}`)}" width="${s.w}" height="${s.h}" sandbox="allow-same-origin" title="${esc(`${label} ${String(opt.id).toUpperCase()} ${screen}`)}"></iframe>
</figure>`).join('\n')).join('\n');
    return `<section>
<h2>${label} ${esc(String(opt.id).toUpperCase())}</h2>
<div class="row">
${figures}
</div>
</section>`;
  }).join('\n');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<style>
body{margin:0;padding:24px;font-family:system-ui,sans-serif;background:#f4f4f5;color:#18181b}
h1{font-size:20px;margin:0 0 16px}
h2{font-size:16px;margin:24px 0 8px}
.row{display:flex;gap:24px;overflow-x:auto;padding-bottom:12px}
figure{margin:0;flex:none}
figcaption{font-size:13px;margin-bottom:4px;color:#52525b}
iframe{border:1px solid #d4d4d8;background:#fff;display:block}
</style>
</head>
<body>
<h1>${esc(title)}</h1>
${rows}
</body>
</html>
`;
}

export function openFile(file, { platform = process.platform, spawn = nodeSpawn } = {}) {
  const command = platform === 'win32' ? 'explorer.exe' : platform === 'darwin' ? 'open' : 'xdg-open';
  const child = spawn(command, [file], { detached: true, stdio: 'ignore', windowsHide: true });
  if (child && typeof child.unref === 'function') child.unref();
}
