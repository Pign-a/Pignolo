'use strict';
// Presentación (spec §6.1, R-8, R-9): decisión del formato, aprobación de plantillas,
// opciones idénticas al texto y filtro de lo que se publica. Pura salvo la lectura de
// templates/present/. Nunca repite en una salida el dato que bloquea.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMATS = ['simple', 'ui', 'infra', 'decision'];
const PRESENTATIONS = ['ask', 'artifact', 'text'];

// El proyecto pisa al usuario. artifact o ask sin la herramienta de artifacts: text
// (artifact avisa en una línea; ask no tiene nada que preguntar).
function resolvePresentation({ userConfig = {}, projectConfig = {}, artifactToolAvailable = false } = {}) {
  const user = PRESENTATIONS.includes(userConfig.presentation)
    ? userConfig.presentation
    : (userConfig.profile === 'economy' ? 'text' : 'ask');
  const wanted = PRESENTATIONS.includes(projectConfig.presentation) ? projectConfig.presentation : user;
  if (wanted === 'text') return { mode: 'text' };
  if (!artifactToolAvailable) {
    return wanted === 'artifact'
      ? { mode: 'text', notice: 'La presentación como artifact no está habilitada en esta sesión; se usa texto.' }
      : { mode: 'text' };
  }
  return { mode: wanted };
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// La plantilla de <formato> está aprobada si templates/present/APPROVALS.md tiene una línea
// `- <formato> v<N> — aprobado <AAAA-MM-DD> — sha256 <hash>` (la última del formato), el
// archivo templates/present/<formato>.html lleva la marca
// `<!-- pignolo-present: formato=<f> version=<N> -->` con el mismo N, y su sha256 coincide.
function templateApproved({ pluginRoot, format }) {
  if (!FORMATS.includes(format)) return { approved: false, reason: `formato desconocido: ${format}` };
  const dir = path.join(pluginRoot, 'templates', 'present');
  let approvals;
  try { approvals = fs.readFileSync(path.join(dir, 'APPROVALS.md'), 'utf8'); } catch (_) { return { approved: false, reason: 'no hay APPROVALS.md' }; }
  const re = new RegExp(`^-\\s+${format}\\s+v(\\d+)\\s+—\\s+aprobado\\s+\\d{4}-\\d{2}-\\d{2}\\s+—\\s+sha256\\s+([0-9a-f]{64})\\s*$`, 'gm');
  const lines = [...approvals.matchAll(re)];
  if (!lines.length) return { approved: false, reason: `${format} no tiene una aprobación registrada` };
  const [, version, hash] = lines[lines.length - 1];
  let buf;
  try { buf = fs.readFileSync(path.join(dir, `${format}.html`)); } catch (_) { return { approved: false, reason: `falta la plantilla ${format}.html` }; }
  const mark = /<!--\s*pignolo-present:\s*formato=(\S+)\s+version=(\d+)\s*-->/.exec(buf.toString('utf8'));
  if (!mark || mark[1] !== format) return { approved: false, reason: `${format}.html no lleva la marca pignolo-present` };
  if (mark[2] !== version) return { approved: false, reason: `versión aprobada v${version}, pero la plantilla es v${mark[2]}` };
  if (sha256(buf) !== hash) return { approved: false, reason: 'el sha256 de la plantilla no coincide con el aprobado' };
  return { approved: true };
}

// El lienzo "Design" exige el consentimiento del proyecto y que el tipo exista.
function canvasAllowed({ projectConfig = {}, designTypeAvailable = false } = {}) {
  return projectConfig.canvasConsent === true && designTypeAvailable === true;
}

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const normLabel = (s) => decode(String(s).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Las opciones del HTML (`data-option="<id>"`, rótulo = texto del elemento) contra las del
// texto [{ id, label }]: mismos ids y mismos rótulos normalizados.
function sameOptions(textOptions, html) {
  const found = new Map();
  for (const m of String(html).matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bdata-option\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/\1>/gi)) found.set(m[2], normLabel(m[3]));
  const want = new Map((textOptions || []).map((o) => [String(o.id), normLabel(o.label)]));
  const extra = [...found.keys()].filter((id) => !want.has(id));
  const missing = [...want.keys()].filter((id) => !found.has(id));
  const changed = [...want.keys()].filter((id) => found.has(id) && found.get(id) !== want.get(id));
  return { same: !extra.length && !missing.length && !changed.length, extra, missing, changed };
}

const SECRETS = [
  ['aws-access-key', /AKIA[0-9A-Z]{16}/],
  ['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['github-token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['api-key-sk', /sk-[A-Za-z0-9]{20,}/],
  ['slack-token', /xox[baprs]-[A-Za-z0-9-]{10,}/],
  ['credential-assignment', /(password|passwd|secret|token)\s*[:=]\s*\S{6,}/i],
];

// Lo que bloquea publicar. `match` nombra la regla o el patrón, nunca el dato.
function scanPublishable(html, { piiPatterns = [] } = {}) {
  const out = [];
  const text = String(html);
  for (const p of piiPatterns) if (new RegExp(p).test(text)) out.push({ kind: 'pii', match: p });
  for (const [name, re] of SECRETS) if (re.test(text)) out.push({ kind: 'secret', match: name });
  return out;
}

module.exports = { FORMATS, resolvePresentation, templateApproved, canvasAllowed, sameOptions, scanPublishable };
