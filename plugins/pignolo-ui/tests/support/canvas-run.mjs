// Fixtures of the canvas tests: a temporary project with a run folder that holds option-A|B|C
// folders of synthetic screens (no real data), and a throwaway git repository when asked.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { makeTempDir, runScript } from '../helpers.mjs';

export const RUN_ID = '2026-10-01-1800-new-cuenta';

export function screenHtml(title, { link = null, extra = '', head = '' } = {}) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${title}</title>
${head}<style>
:root{--color-primary:#1a56db}
body{margin:0;font-family:system-ui,sans-serif}
.cta{display:inline-block;padding:12px 16px;background:var(--color-primary);color:#fff;text-decoration:none}
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p data-sample>$ 12.480,00</p>
${link ? `<a class="cta" data-primary="true" href="${link}">Siguiente</a>\n` : ''}${extra}<p>Datos de muestra</p>
</main>
</body>
</html>
`;
}

export function gitInit(project) {
  for (const args of [['init', '-q'], ['config', 'user.name', 'Persona Ejemplo'], ['config', 'user.email', 'persona@ejemplo.test']]) {
    const r = spawnSync('git', args, { cwd: project, encoding: 'utf8', windowsHide: true });
    if (r.status !== 0) throw new Error(`git ${args[0]} falló: ${r.stderr}`);
  }
}

// -> { project, run, runId, optionDir(letter) }
export function makeRun({ options = ['A', 'B', 'C'], screens = ['inicio.html', 'detalle.html'], runId = RUN_ID, git = false, projectName = null } = {}) {
  const base = makeTempDir();
  const project = projectName ? path.join(base, projectName) : base;
  fs.mkdirSync(project, { recursive: true });
  if (git) gitInit(project);
  const run = path.join(project, '.pignolo-ui', 'runs', runId);
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(project, '.pignolo-ui', '.gitignore'), '*\n');
  for (const letter of options) {
    const dir = path.join(run, `option-${letter}`);
    fs.mkdirSync(dir, { recursive: true });
    screens.forEach((file, i) => {
      const title = `${letter} ${file.replace('.html', '')}`;
      const next = screens.length > 1 ? screens[(i + 1) % screens.length] : null;
      fs.writeFileSync(path.join(dir, file), screenHtml(title, { link: next }));
    });
  }
  return { project, run, runId, optionDir: (letter) => path.join(run, `option-${letter}`) };
}

export const BUILD_ARGS = (r, extra = {}) => {
  const o = { options: 'A,B,C', screens: 'inicio.html,detalle.html', platform: 'desktop', 'page-name': 'new · 2026-10-01', design: 'none', first: 'yes', now: '2026-10-01T18:00:00Z', ...extra };
  return ['build', '--project', r.project, '--run', r.run, ...Object.entries(o).flatMap(([k, v]) => [`--${k}`, String(v)])];
};

export const canvasIndex = (args, opts) => runScript('canvas-index.mjs', args, opts);

// Another run of the SAME project (a second flow on a later day): same project folder, its own run folder and options.
export function addRun(r, { runId = '2026-10-02-0900-improve-pantalla', options = ['A', 'B', 'C'], screens = ['inicio.html', 'detalle.html'] } = {}) {
  const run = path.join(r.project, '.pignolo-ui', 'runs', runId);
  fs.mkdirSync(run, { recursive: true });
  for (const letter of options) {
    const dir = path.join(run, `option-${letter}`);
    fs.mkdirSync(dir, { recursive: true });
    screens.forEach((file, i) => {
      const next = screens.length > 1 ? screens[(i + 1) % screens.length] : null;
      fs.writeFileSync(path.join(dir, file), screenHtml(`${letter} ${file.replace('.html', '')} ${runId}`, { link: next }));
    });
  }
  return { project: r.project, run, runId, optionDir: (letter) => path.join(run, `option-${letter}`) };
}
