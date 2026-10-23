// Leak check (spec §7.4): before an option is published or saved as approved, its files must
// not carry data of the user or the machine: the values the skill passes (session email, git
// user.name / user.email, OS user, home) and any absolute local path (Windows drive,
// /Users/, /home/). Deterministic; the output never echoes a value back (index only).
//
// findLeaks(text, values) -> [{ kind: 'value', index, line } | { kind: 'path', match, line }]
// checkLeaks(dir, values) -> { files, leaks: [{ file, ...leak }] }
import fs from 'node:fs';
import path from 'node:path';

export const MIN_VALUE_LENGTH = 3;
const ABSOLUTE_PATH = /(?<![\w.~-])(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/)/g;

const escapeRegExp = (v) => v.replace(/[.*+?^${}()|\[\]\\]/g, '\\$&');

export function findLeaks(text, values = []) {
  // A value matches on Unicode boundaries: "dev" flags "dev" and "/dev/" but not "device".
  const wanted = values
    .map((v, index) => ({ v: String(v ?? '').trim(), index }))
    .filter((x) => x.v.length >= MIN_VALUE_LENGTH)
    .map((x) => ({ index: x.index, re: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(x.v)}(?![\\p{L}\\p{N}])`, 'iu') }));
  const leaks = [];
  String(text).split('\n').forEach((raw, i) => {
    for (const w of wanted) if (w.re.test(raw)) leaks.push({ kind: 'value', index: w.index, line: i + 1 });
    for (const m of raw.matchAll(ABSOLUTE_PATH)) leaks.push({ kind: 'path', match: m[0], line: i + 1 });
  });
  return leaks;
}

export function checkLeaks(dir, values = []) {
  const files = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else files.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  files.sort();
  const leaks = [];
  for (const f of files) {
    for (const l of findLeaks(fs.readFileSync(path.join(dir, f), 'utf8'), values)) leaks.push({ file: f, ...l });
  }
  return { files, leaks };
}

// Reads the JSON list of values the skill passes; throws on anything else.
export function readValuesFile(file) {
  let values;
  try {
    // Fixed message: a JSON.parse error quotes a slice of the source, which holds the user's values.
    values = JSON.parse(fs.readFileSync(file, 'utf8').replace(new RegExp(`^${String.fromCharCode(0xFEFF)}`), ''));
  } catch {
    throw new Error('the values file is not valid JSON');
  }
  if (!Array.isArray(values) || !values.every((v) => typeof v === 'string')) throw new Error('the values file must be a JSON list of strings');
  return values;
}
