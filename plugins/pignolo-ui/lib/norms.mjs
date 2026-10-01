// Written norms for the agents (spec §3.2, §4.1): norms/base.md plus the author's optional
// norms.md (YAML frontmatter + free body). Invalid author norms are ignored whole, never half.
//
// judgmentIds(baseText) -> ['J-01', ...]
// loadNorms({ baseFile, userFile, catalog }) -> { base, user: null | { ok, symptoms?, body?, warning? } }
// extract({ base, user }) -> text for the ui-option brief and for the auditor (user body <= 4000 chars)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from './yaml-subset.mjs';
import { splitFrontmatter, PIGNOLO_SCHEMA } from './design-doc.mjs';
import { loadCatalog } from './catalog.mjs';
import { loadSymptoms } from './symptoms.mjs';

export const BASE_NORMS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'norms', 'base.md');
const USER_BODY_MAX = 4000;

export function judgmentIds(baseText) {
  return [...String(baseText).matchAll(/^- (J-\d{2}):/gm)].map((m) => m[1]);
}

const ignored = (reason) => ({ ok: false, warning: `normas del autor ignoradas: ${reason}` });

export function loadNorms({ baseFile = BASE_NORMS_FILE, userFile = null, catalog = loadCatalog() } = {}) {
  const base = fs.readFileSync(baseFile, 'utf8');
  if (!userFile || !fs.existsSync(userFile)) return { base, user: null };
  const text = fs.readFileSync(userFile, 'utf8');
  const fm = splitFrontmatter(text);
  if (!fm.ok) return { base, user: { ok: true, symptoms: [], body: text.trim() } };
  const parsed = parseYaml(fm.yaml);
  if (!parsed.supported) return { base, user: ignored(parsed.reason) };
  if (parsed.errors.length) return { base, user: ignored(parsed.errors[0].message) };
  const data = parsed.value || {};
  const allowed = Object.keys(PIGNOLO_SCHEMA.keys);
  const pig = data.pignolo;
  if (pig !== undefined) {
    if (!pig || typeof pig !== 'object' || Array.isArray(pig)) return { base, user: ignored('pignolo debe ser un mapa') };
    const unknown = Object.keys(pig).filter((k) => !allowed.includes(k));
    if (unknown.length) return { base, user: ignored(`clave desconocida pignolo.${unknown[0]}`) };
  }
  let symptoms = [];
  if (data.symptoms !== undefined) {
    if (!Array.isArray(data.symptoms)) return { base, user: ignored('symptoms debe ser una lista') };
    symptoms = data.symptoms;
    const judgment = judgmentIds(base);
    const dict = loadSymptoms();
    for (const s of symptoms) {
      if (!s || typeof s.id !== 'string') return { base, user: ignored('síntoma sin id') };
      for (const r of s.rules || []) {
        if (!catalog.rules.some((x) => x.id === r) && !judgment.includes(r)) return { base, user: ignored(`regla inexistente ${r}`) };
      }
      if (!dict.symptoms.some((d) => d.id === s.id) && (!s.label || !Array.isArray(s.rules))) {
        return { base, user: ignored(`el síntoma ${s.id} necesita label y rules`) };
      }
    }
  }
  return { base, user: { ok: true, symptoms, body: fm.body.trim() } };
}

function section(base, title) {
  const start = base.indexOf(`## ${title}`);
  if (start < 0) return '';
  const rest = base.slice(start + title.length + 3);
  const next = /^## /m.exec(rest);
  return `## ${title}\n${(next ? rest.slice(0, next.index) : rest).trim()}`;
}

export function extract({ base, user }) {
  const parts = [section(base, 'Tone by register'), section(base, 'Judgment criteria')].filter(Boolean);
  if (user && user.ok && user.body) parts.push(`## Author norms\n${user.body.slice(0, USER_BODY_MAX)}`);
  return `${parts.join('\n\n')}\n`;
}
