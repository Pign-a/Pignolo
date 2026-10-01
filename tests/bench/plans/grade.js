'use strict';
// Calificador determinista de la prueba de validación de planes. Un hallazgo
// { task, kind, evidence, keywords } coincide con un error plantado si nombra una de
// sus tareas y al menos una de sus palabras clave (en evidence, kind o keywords,
// sin distinguir mayúsculas). Límite declarado: un hallazgo bien escrito con otras
// palabras no coincide; los no coincidentes se revisan a mano en la sonda.
// Las cifras del caso real en tests/evals/RESULTS-planes.md se contaron A MANO: este
// calificador por palabras clave sobrecuenta (palabras clave genéricas coinciden con
// hallazgos que no describen el error); las palabras se comparan completas, pero eso no
// lo vuelve una fuente de esas cifras.

// "Task 3", "T3", "t3" y "3" son la misma tarea.
function normTask(t) {
  return String(t == null ? '' : t).trim().toLowerCase().replace(/^task\s*/, '').replace(/^t(?=\d)/, '').replace(/[:.]$/, '');
}

// Último bloque ```json del texto; devuelve { findings, error }.
function extractFindings(text) {
  const blocks = [...String(text || '').matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (!blocks.length) return { findings: [], error: 'no hay bloque json en el informe' };
  try {
    const parsed = JSON.parse(blocks[blocks.length - 1][1]);
    if (!Array.isArray(parsed)) return { findings: [], error: 'el bloque json no es un arreglo' };
    return { findings: parsed, error: null };
  } catch (e) {
    return { findings: [], error: `json mal formado: ${e.message}` };
  }
}

function haystack(finding) {
  return [finding.kind, finding.evidence, ...(Array.isArray(finding.keywords) ? finding.keywords : [])]
    .filter((x) => typeof x === 'string').join('\n').toLowerCase();
}

function matches(finding, err) {
  if (!finding || typeof finding !== 'object') return false;
  if (!(err.tasks || []).some((t) => normTask(t) === normTask(finding.task))) return false;
  const hay = haystack(finding);
  return err.keywords.some((k) => hasWord(hay, String(k).toLowerCase()));
}

// Coincidencia por límite de palabra: `cat` no está en `catastrophic`. El límite solo se
// exige en un extremo de la palabra clave que sea carácter de palabra, así `process.exit`
// o `node --check` (puntuación en el medio o al final) siguen coincidiendo.
function hasWord(hay, kw) {
  if (!kw) return false;
  const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pre = /^\w/.test(kw) ? '(?<!\\w)' : '';
  const post = /\w$/.test(kw) ? '(?!\\w)' : '';
  return new RegExp(pre + esc + post).test(hay);
}

// grade({ findings, truth, plan }): `findings` es el arreglo o el texto del informe,
// `truth` el contenido de truth.json y `plan` la clave del caso (real, p1, p2, p3, clean).
function grade({ findings, truth, plan }) {
  const errors = truth[plan];
  if (!Array.isArray(errors)) throw new Error(`caso desconocido en truth.json: ${plan}`);
  let list = findings;
  let error = null;
  if (typeof findings === 'string') ({ findings: list, error } = extractFindings(findings));
  else if (!Array.isArray(findings)) { list = []; error = 'los hallazgos no son un arreglo'; }

  const found = new Set();
  const falsePositives = [];
  for (const finding of list) {
    const hit = errors.filter((e) => matches(finding, e));
    if (hit.length) hit.forEach((e) => found.add(e.id));
    else falsePositives.push(finding);
  }
  return {
    found: errors.filter((e) => found.has(e.id)).map((e) => e.id),
    missed: errors.filter((e) => !found.has(e.id)).map((e) => e.id),
    falsePositives,
    error,
  };
}

module.exports = { grade, extractFindings, normTask };
