#!/usr/bin/env node
// Genera los SVG del encabezado del README (docs/assets/*.svg, variantes clara y oscura).
// Sin dependencias; Node >= 22.   node tests/evals/readme-charts.mjs
//
// Las cifras son las de los registros públicos y se copian acá a mano, con su origen:
//   estudio A (costo, aceptación): tests/evals/RESULTS-estudio-a-trabajo.md
//   estudio B (revisión):          tests/evals/RESULTS-estudio-b-revision.md
// Si cambian los registros, se cambian las constantes de DATA y se vuelve a correr.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'assets');

const DATA = {
  // Razón de medias geométricas de costo por tarea contra "sin plugin" (= 100), IC 90 %.
  costoA: [
    { key: 'none', label: 'Sin plugin', note: 'referencia', value: 100 },
    { key: 'pignolo', label: 'Pignolo', note: '/pignolo:work', value: 105.5, lo: 99.5, hi: 112.0 },
    { key: 'super', label: 'Superpowers', note: 'su flujo, forzado', value: 141.5, lo: 126.8, hi: 157.6 },
  ],
  // Costo mediano por corrida (USD) y defectos sembrados detectados, de 20.
  revisionB: [
    { key: 'native', label: '/code-review', note: 'comando nativo', usd: 0.14, found: 17 },
    { key: 'none', label: 'Sin plugin', note: 'pedido simple', usd: 0.22, found: 19 },
    { key: 'pignolo', label: 'Pignolo', note: '/pignolo:validate', usd: 0.27, found: 19 },
    { key: 'super', label: 'Superpowers', note: 'su skill de revisión', usd: 0.42, found: 19 },
  ],
};

// El color sigue a la entidad, no a su posición. Pignolo = azul, superpowers = naranja,
// /code-review = aqua (casillas 1, 2 y 3 de la paleta validada); "sin plugin" es el gris neutro de referencia.
const THEMES = {
  light: {
    surface: '#f6f8fa', tile: '#ffffff', border: '#d1d9e0', ink: '#1f2328', ink2: '#59636e', muted: '#656d76', grid: '#afb8c1',
    none: '#8c959f', pignolo: '#2a78d6', super: '#eb6834', native: '#1baf7a',
  },
  dark: {
    surface: '#161b22', tile: '#0d1117', border: '#30363d', ink: '#f0f6fc', ink2: '#b1bac4', muted: '#9198a1', grid: '#484f58',
    none: '#6e7681', pignolo: '#3987e5', super: '#d95926', native: '#199e70',
  },
};

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const W = 880;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const es = (n, d = 0) => n.toFixed(d).replace('.', ',');

function open(h, t, title, desc) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img" aria-labelledby="t d" font-family="${FONT}">
<title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>
<rect x="0.5" y="0.5" width="${W - 1}" height="${h - 1}" rx="16" fill="${t.surface}" stroke="${t.border}"/>`;
}

// Barra con el extremo de datos redondeado (4 px) y la base recta, anclada a la izquierda.
function bar(x, y, w, h, fill, r = 4) {
  const rr = Math.min(r, w / 2);
  return `<path d="M${x} ${y}H${x + w - rr}Q${x + w} ${y} ${x + w} ${y + rr}V${y + h - rr}Q${x + w} ${y + h} ${x + w - rr} ${y + h}H${x}Z" fill="${fill}"/>`;
}

const text = (x, y, s, size, fill, weight = 400, anchor = 'start') =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(s)}</text>`;

function hero(t) {
  const tiles = [
    { big: '−25 %', l1: 'de costo frente a', l2: 'superpowers', s: 'razón 0,75 · 16 tareas reales' },
    { big: '≈ +5 %', l1: 'frente a no usar plugin', l2: 'sin perder aceptación', s: 'no inferior (margen 1,5)' },
    { big: '47/48', l1: 'corridas que pasan los', l2: 'tests ocultos', s: 'los tres brazos, un solo fallo' },
    { big: '19/20', l1: 'defectos sembrados', l2: 'detectados al validar', s: 'igual que superpowers' },
  ];
  let g = open(320, t, 'Pignolo 2: resultados medidos',
    'Cuatro cifras: 25 % menos de costo que superpowers, 5 % más que no usar plugin, 47 de 48 corridas aceptadas y 19 de 20 defectos detectados.');
  g += text(40, 86, 'Pignolo 2', 54, t.ink, 800);
  g += text(40, 120, 'Un plugin de Claude Code que reemplaza a superpowers: pocas reglas y nada que bloquee.', 18, t.ink2);
  const tw = 188, gap = 16, y0 = 150, th = 124;
  tiles.forEach((k, i) => {
    const x = 40 + i * (tw + gap);
    g += `<rect x="${x}" y="${y0}" width="${tw}" height="${th}" rx="12" fill="${t.tile}" stroke="${t.border}"/>`;
    g += `<rect x="${x}" y="${y0 + 18}" width="4" height="${th - 36}" rx="2" fill="${t.pignolo}"/>`;
    g += text(x + 22, y0 + 52, k.big, 38, t.ink, 800);
    g += text(x + 22, y0 + 78, k.l1, 14, t.ink2);
    g += text(x + 22, y0 + 96, k.l2, 14, t.ink2);
    g += text(x + 22, y0 + 114, k.s, 11.5, t.muted);
  });
  g += text(40, 302, 'Dos estudios preinscritos con datos propios · una app, un modelo, una repetición por celda · no demuestran una mejora de calidad', 12, t.muted);
  return g + '</svg>\n';
}

function costo(t) {
  const H = 330, x0 = 216, plotW = 560, max = 170;
  const px = (v) => x0 + (v * plotW) / max;
  let g = open(H, t, 'Costo por tarea relativo a no usar plugin',
    'Barras con intervalo: sin plugin 100, Pignolo 105 (99 a 112), superpowers 141 (127 a 158). Menos es mejor.');
  g += text(40, 46, 'Pignolo cuesta como no usar plugin; superpowers, un 41 % más', 21, t.ink, 800);
  g += text(40, 70, 'Costo por tarea, sin plugin = 100 · razón de medias geométricas con IC 90 % · menos es mejor', 13, t.ink2);
  const top = 100, rowH = 62, bh = 34;
  const xr = px(100);
  g += `<line x1="${xr}" y1="${top - 12}" x2="${xr}" y2="${top + rowH * 3 - 14}" stroke="${t.grid}" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  DATA.costoA.forEach((d, i) => {
    const y = top + i * rowH;
    g += text(x0 - 16, y + 17, d.label, 16, t.ink, 700, 'end');
    g += text(x0 - 16, y + 34, d.note, 12, t.muted, 400, 'end');
    g += bar(x0, y, px(d.value) - x0, bh, t[d.key]);
    if (d.lo !== undefined) {
      const cy = y + bh / 2, a = px(d.lo), b = px(d.hi);
      g += `<g stroke="${t.ink}" stroke-width="2" stroke-linecap="round"><line x1="${a}" y1="${cy}" x2="${b}" y2="${cy}"/><line x1="${a}" y1="${cy - 6}" x2="${a}" y2="${cy + 6}"/><line x1="${b}" y1="${cy - 6}" x2="${b}" y2="${cy + 6}"/></g>`;
    }
    const lx = px(d.hi ?? d.value) + 14;
    g += text(lx, y + 17, es(d.value, d.lo !== undefined ? 1 : 0), 20, t.ink, 800);
    if (d.lo !== undefined) g += text(lx, y + 33, `${es(d.lo, 1)} a ${es(d.hi, 1)}`, 12, t.muted);
  });
  g += text(xr + 6, top + rowH * 3 - 6, '100 = sin plugin', 12, t.muted);
  return g + '</svg>\n';
}

function revision(t) {
  const H = 350, x0 = 216, plotW = 440, max = 0.5;
  const px = (v) => x0 + (v * plotW) / max;
  let g = open(H, t, 'Revisión de un commit con defectos sembrados',
    'Costo mediano por corrida y defectos detectados de 20: /code-review 0,14 dólares y 17; sin plugin 0,22 y 19; Pignolo 0,27 y 19; superpowers 0,42 y 19.');
  g += text(40, 46, 'Misma detección, distinto precio', 21, t.ink, 800);
  g += text(40, 70, 'Revisión de un commit · 8 commits con 20 defectos sembrados y 2 controles limpios · una corrida por celda', 13, t.ink2);
  g += text(W - 40, 104, 'defectos detectados', 12, t.muted, 400, 'end');
  const top = 118, rowH = 52, bh = 30;
  DATA.revisionB.forEach((d, i) => {
    const y = top + i * rowH;
    g += text(x0 - 16, y + 14, d.label, 16, t.ink, 700, 'end');
    g += text(x0 - 16, y + 30, d.note, 12, t.muted, 400, 'end');
    g += bar(x0, y, px(d.usd) - x0, bh, t[d.key]);
    g += text(px(d.usd) + 12, y + 21, `US$ ${es(d.usd, 2)}`, 18, t.ink, 800);
    g += text(W - 40, y + 22, `${d.found}/20`, 22, t.ink, 800, 'end');
  });
  g += text(x0, top + rowH * 4 + 8, 'Costo mediano por corrida en dólares · menos es mejor', 12, t.muted);
  return g + '</svg>\n';
}

mkdirSync(OUT, { recursive: true });
for (const [mode, t] of Object.entries(THEMES)) {
  writeFileSync(join(OUT, `hero-${mode}.svg`), hero(t));
  writeFileSync(join(OUT, `costo-${mode}.svg`), costo(t));
  writeFileSync(join(OUT, `revision-${mode}.svg`), revision(t));
}
console.log(`escritos 6 SVG en ${OUT}`);
