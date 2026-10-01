// Symptom dictionary (spec §5.7, §8): plain-language complaints mapped to catalog rules.
//
// loadSymptoms(file?) -> { version, symptoms }
// checkSymptoms(dict, { catalog, judgmentIds }) -> [problem strings]; [] when valid
// mergeUserSymptoms(dict, extra) -> dict with the author's words/symptoms from norms.md
// matchWords(text, symptoms) -> ids whose words appear in text (case and accent blind)
// buildMenu({ symptoms, failedIds }) -> [{ n, id, label, rules, preticked }]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SYMPTOMS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'catalog', 'symptoms.json');

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function loadSymptoms(file = SYMPTOMS_FILE) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  return JSON.parse(text);
}

export function checkSymptoms(dict, { catalog, judgmentIds = [] } = {}) {
  const problems = [];
  const list = dict && Array.isArray(dict.symptoms) ? dict.symptoms : null;
  if (!list) return ['dictionary has no symptoms list'];
  const known = new Set([...(catalog ? catalog.rules.map((r) => r.id) : []), ...judgmentIds]);
  const seen = new Set();
  for (const s of list) {
    const id = s && s.id;
    if (typeof id !== 'string' || !KEBAB.test(id)) { problems.push(`invalid id ${JSON.stringify(id)}`); continue; }
    if (seen.has(id)) problems.push(`duplicate id ${id}`);
    seen.add(id);
    if (!Array.isArray(s.words) || s.words.length === 0) problems.push(`${id}: words must be a non-empty list`);
    else {
      for (const w of s.words) {
        if (typeof w !== 'string' || !w.trim()) problems.push(`${id}: empty word`);
        else if (w !== w.toLowerCase()) problems.push(`${id}: word "${w}" must be lowercase`);
      }
    }
    if (typeof s.label !== 'string' || !s.label.trim()) problems.push(`${id}: label missing`);
    if (!Array.isArray(s.rules)) problems.push(`${id}: rules must be a list`);
    else if (catalog) {
      for (const r of s.rules) if (!known.has(r)) problems.push(`${id}: unknown rule ${r}`);
    }
  }
  return problems;
}

export function mergeUserSymptoms(dict, extra = []) {
  const symptoms = dict.symptoms.map((s) => ({ ...s, words: [...s.words], rules: [...s.rules] }));
  for (const e of extra) {
    if (!e || typeof e.id !== 'string' || !KEBAB.test(e.id)) throw new Error(`invalid symptom id ${JSON.stringify(e && e.id)}`);
    const words = (e.words || []).map((w) => String(w).toLowerCase());
    const found = symptoms.find((s) => s.id === e.id);
    if (found) {
      for (const w of words) if (!found.words.includes(w)) found.words.push(w);
    } else {
      if (!e.label || !Array.isArray(e.rules)) throw new Error(`new symptom ${e.id} needs label and rules`);
      symptoms.push({ id: e.id, label: e.label, words, rules: [...e.rules], fix: e.fix || '' });
    }
  }
  return { ...dict, symptoms };
}

const fold = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function matchWords(text, symptoms) {
  const hay = fold(text);
  return symptoms.filter((s) => s.words.some((w) => hay.includes(fold(w)))).map((s) => s.id);
}

export function buildMenu({ symptoms, failedIds = [] }) {
  const failed = new Set(failedIds);
  return symptoms.map((s, i) => ({
    n: i + 1,
    id: s.id,
    label: s.label,
    rules: s.rules,
    preticked: s.rules.some((r) => failed.has(r)),
  }));
}
