'use strict';
// Egreso de red (spec §8.3, R-7 del hito 6; D-6-3.a): mientras hay un flujo de pignolo en curso
// (run.json vigente) ningún subagente usa WebSearch/WebFetch salvo pignolo:researcher, y ninguno
// usa herramientas MCP (tampoco el researcher). Al researcher se le filtra la consulta contra los
// pii-patterns del proyecto y contra identificadores del proyecto (rutas del checkout principal y
// de los worktrees, con / y con \, y la ruta del origin sin el host). Es una lista, no un
// clasificador: best-effort, declarado. El hilo principal no tiene restricción. Puro: sin E/S.
const RESEARCHER = 'pignolo:researcher';
const MIN_ID_LEN = 6;

function classifyTool(name) {
  if (name === 'WebSearch' || name === 'WebFetch') return 'web';
  if (typeof name === 'string' && name.startsWith('mcp__')) return 'mcp';
  return 'other';
}

// Rutas del proyecto en las dos grafías y en minúscula; descarta las de menos de 6 caracteres
// (`C:\a` o `/tmp` llenarían de falsos denies cualquier consulta).
function projectIdentifiers({ main, worktrees = [], originPath } = {}) {
  const out = new Set();
  const add = (s) => {
    if (typeof s !== 'string') return;
    const t = s.trim().replace(/[\\/]+$/, '');
    if (t.length < MIN_ID_LEN) return;
    out.add(t.replace(/\\/g, '/').toLowerCase());
    out.add(t.replace(/\//g, '\\').toLowerCase());
  };
  add(main);
  for (const w of worktrees) add(w);
  if (typeof originPath === 'string') {
    const p = originPath.trim().replace(/^\/+/, '').replace(/\.git$/i, '');
    if (p.length >= MIN_ID_LEN) { out.add(p.toLowerCase()); out.add(p.replace(/\//g, '\\').toLowerCase()); }
  }
  return [...out].sort();
}

// Ruta del origin sin el host: https://host/a/b.git -> a/b ; git@host:a/b.git -> a/b ; /x/y -> x/y
function originPathOf(url) {
  if (typeof url !== 'string' || !url.trim()) return null;
  const u = url.trim();
  let m = /^[a-z][a-z0-9+.-]*:\/\/[^/]+\/(.+)$/i.exec(u);
  if (m) return m[1].replace(/\.git$/i, '');
  m = /^[^@\s/]+@[^:\s]+:(.+)$/.exec(u);
  if (m) return m[1].replace(/\.git$/i, '');
  return u.replace(/^[a-zA-Z]:/, '').replace(/^[\\/]+/, '').replace(/\.git$/i, '');
}

// Todo valor de texto del tool_input, a cualquier profundidad (campo desconocido = se mira igual).
function textOf(toolInput, depth = 0, out = []) {
  if (depth > 8) return out;
  if (typeof toolInput === 'string') out.push(toolInput);
  else if (Array.isArray(toolInput)) for (const v of toolInput) textOf(v, depth + 1, out);
  else if (toolInput && typeof toolInput === 'object') for (const v of Object.values(toolInput)) textOf(v, depth + 1, out);
  return out;
}

// null si la consulta está limpia; { reason, match } si nombra un identificador del proyecto o
// coincide con un pii-pattern. Una regex inválida no pasa en silencio: { reason: 'pii-pattern-invalid' }.
function checkQuery({ texts = [], piiPatterns = [], identifiers = [] } = {}) {
  const regs = [];
  for (const p of piiPatterns) {
    try { regs.push(new RegExp(p)); } catch (_) { return { reason: 'pii-pattern-invalid', match: String(p) }; }
  }
  for (const text of texts) {
    if (typeof text !== 'string' || !text) continue;
    const lower = text.toLowerCase();
    for (const id of identifiers) if (id && lower.includes(id)) return { reason: 'project-identifier', match: id };
    for (let i = 0; i < regs.length; i += 1) {
      const m = regs[i].exec(text);
      if (m) return { reason: 'pii-pattern', match: String(piiPatterns[i]) };
    }
  }
  return null;
}

const deny = (reason, alternative) => ({ allow: false, reason, alternative });

// { allow: true } | { allow: false, reason, alternative }. `flow` = lo que devuelve readRun (o null).
function decideEgress({ tool, agentType, hasAgentId, flow, toolInput, project } = {}) {
  if (!hasAgentId) return { allow: true };
  if (!flow || !flow.running) return { allow: true };
  const cls = classifyTool(tool);
  if (cls === 'other') return { allow: true };
  const malformed = flow.malformed ? ` El marcador del flujo (${flow.file || 'run.json'}) no se puede leer; si no hay un flujo en curso, el humano lo borra.` : '';
  if (cls === 'mcp') return deny(`ningún subagente usa herramientas MCP (${tool}) mientras corre un flujo de pignolo.${malformed}`, 'devolvé BLOCKED y nombrá qué necesitás de ese MCP; lo usa el hilo principal');
  if (agentType !== RESEARCHER) return deny(`${tool} lo usa solo pignolo:researcher mientras corre un flujo de pignolo (este agente es ${agentType || 'desconocido'}).${malformed}`, 'devolvé BLOCKED y pedí que el hilo principal despache pignolo:researcher con la pregunta en abstracto');
  const p = project || {};
  const hit = checkQuery({ texts: textOf(toolInput), piiPatterns: p.piiPatterns || [], identifiers: p.identifiers || [] });
  if (!hit) return { allow: true };
  if (hit.reason === 'pii-pattern-invalid') return deny(`no se pudo aplicar pii-patterns (regex inválida: ${hit.match}); se niega por las dudas.`, 'pedile al hilo principal que corrija pii-patterns en .pignolo/project.md');
  const what = hit.reason === 'pii-pattern' ? `coincide con un pii-pattern del proyecto (${hit.match})` : `nombra un identificador del proyecto (${hit.match})`;
  return deny(`la consulta ${what}.`, 'reformulá la pregunta en abstracto, sin rutas, nombres del proyecto ni datos personales');
}

module.exports = { RESEARCHER, classifyTool, projectIdentifiers, originPathOf, textOf, checkQuery, decideEgress };
