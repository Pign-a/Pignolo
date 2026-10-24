// Escape detection: does a tool call of the agent reach the source repo, the private folder or another run, or does a
// relative path leave the run folder?
// Paths are compared lowercase, with forward slashes, repeated slashes collapsed (doubled backslashes) and the
// git-bash (/c/...) and WSL (/mnt/c/...) drive forms turned into c:/... . A match must sit on a path boundary:
// the character before and after the needle is not part of a name, so X/app does not match X/app-runs.
//
// The relative check (".." that leaves the run folder) reads only the command line of a shell command: heredoc bodies
// and quoted strings with spaces (code, regexes, messages) are ignored, "..." is not "..", and the working directory
// follows the simple "cd" prefixes of the command, so "cd <abs> && ... && cd ../../.." is resolved from where it really is.
const IDENT = /[a-z0-9._-]/;
const PATH_KEYS = new Set(['file_path', 'path', 'notebook_path', 'cwd']);

function normalizeText(t) {
  return String(t).toLowerCase()
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/(^|[\s"'`=;,(<>|&])\/mnt\/([a-z])\//g, '$1$2:/')
    .replace(/(^|[\s"'`=;,(<>|&])\/([a-z])\//g, '$1$2:/');
}
const normPath = (p) => normalizeText(p).replace(/\/+$/, '');

// First index where `needle` appears on a path boundary at or after `from`, or -1.
function indexAtBoundary(hay, needle, from = 0) {
  let i = hay.indexOf(needle, from);
  while (i >= 0) {
    const before = i === 0 ? '' : hay[i - 1];
    const after = hay[i + needle.length] || '';
    if ((!before || !IDENT.test(before)) && (!after || !IDENT.test(after))) return i;
    i = hay.indexOf(needle, i + 1);
  }
  return -1;
}

// Every string inside a tool input (not its JSON text, so backslashes are not doubled by the encoding).
function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, out));
  return out;
}

const posixNormalize = (p) => {
  const parts = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return (p.startsWith('/') ? '/' : '') + parts.join('/');
};
const isAbs = (t) => t.startsWith('/') || /^[a-z]:\//.test(t);

// The command lines of a shell script without the bodies of its heredocs (<<'E' ... E).
function withoutHeredocs(text) {
  const out = [];
  let end = null;
  for (const line of text.split(/\r?\n/)) {
    if (end !== null) {
      if (line.trim() === end) end = null;
      continue;
    }
    out.push(line);
    const m = line.match(/<<-?\s*(['"]?)([a-z_][a-z0-9_]*)\1/);
    if (m) end = m[2];
  }
  return out.join('\n');
}

// Splits a command line into commands (on && || ; | & newline and parentheses) and tokens (quotes respected).
// A quoted token keeps `quoted: true`; one with spaces inside is text, not a path.
function parseCommands(text) {
  const commands = [];
  let tokens = [];
  let cur = '';
  let quoted = false;
  let q = null;
  const endToken = () => { if (cur !== '' || quoted) tokens.push({ text: cur, quoted }); cur = ''; quoted = false; };
  const endCommand = () => { endToken(); if (tokens.length) commands.push(tokens); tokens = []; };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (q) {
      if (ch === q) q = null; else cur += ch;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      q = ch; quoted = true;
    } else if (ch === '&' || ch === '|' || ch === ';' || ch === '\n' || ch === '(' || ch === ')') {
      endCommand();
    } else if (/\s/.test(ch) || ch === '<' || ch === '>') {
      endToken();
    } else {
      cur += ch;
    }
  }
  endCommand();
  return commands;
}

// Is this token a real relative path that climbs out with "../" ("../x", "x/../y", "a/..")?
function climbs(tok) {
  if (/\s/.test(tok.text) || tok.text.includes('://') || /[${}]/.test(tok.text)) return false;
  const segs = tok.text.split('/');
  return segs.includes('..') && (tok.text.startsWith('../') || tok.text.includes('/../') || tok.text.endsWith('/..'));
}

// Does a shell command leave the run folder through "..", starting in `startCwd`? (all paths normalized, lowercase)
function leavesRunFolder(command, startCwd, run) {
  let cwd = startCwd;
  const inside = (p) => p === run || p.startsWith(`${run}/`);
  for (const cmd of parseCommands(withoutHeredocs(command))) {
    const words = cmd.map((t) => t.text);
    if (words[0] === 'cd' || words[0] === 'pushd') {
      const arg = words[1] === '/d' ? words[2] : words[1];
      if (arg === undefined || arg === '-' || arg.startsWith('~') || /[$]/.test(arg)) return false;
      const next = posixNormalize(isAbs(arg) ? arg : `${cwd}/${arg}`);
      // An absolute cd elsewhere is not a ".." escape; only a relative climb out of the run folder is.
      if (!isAbs(arg) && !inside(next)) return true;
      cwd = next;
      continue;
    }
    for (const tok of cmd.slice(1)) {
      if (!climbs(tok)) continue;
      if (!inside(posixNormalize(isAbs(tok.text) ? tok.text : `${cwd}/${tok.text}`))) return true;
    }
  }
  return false;
}

// First tool_use that leaves the run folder. Returns { match, tool, command } or null.
export function findEscape(text, { sourceRepo, privateRoot, workRoot, runDir }) {
  const needles = [['sourceRepo', normPath(sourceRepo)], ['privateRoot', normPath(privateRoot)]];
  const work = normPath(workRoot);
  const run = normPath(runDir);
  const ownRel = run.startsWith(`${work}/`) ? run.slice(work.length + 1) : run.split('/').pop();
  const repoDir = `${run}/repo`;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.includes('tool_use')) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (!o || o.type !== 'assistant' || !o.message || !Array.isArray(o.message.content)) continue;
    for (const b of o.message.content) {
      if (!b || b.type !== 'tool_use') continue;
      const joined = strings(b.input).join('\n');
      const hay = normalizeText(joined);
      let match = null;
      for (const [name, n] of needles) if (n && indexAtBoundary(hay, n) >= 0) { match = name; break; }
      if (!match) {
        let from = 0;
        for (;;) {
          const at = indexAtBoundary(hay, work, from);
          if (at < 0) break;
          const rest = hay.slice(at + work.length);
          if (!rest.startsWith('/')) { match = 'workRoot'; break; }
          const rel = rest.slice(1);
          const own = rel.startsWith(ownRel) && !IDENT.test(rel[ownRel.length] || '');
          // The shared snapshot of node_modules is reached through the junction; its manifest guards it.
          // Reading the arm's own plugin tree (workRoot/arms/...) is part of using the plugin, not an escape.
          if (!own && !rel.startsWith('_nm') && !rel.startsWith('arms/')) { match = 'otherRun'; break; }
          from = at + work.length;
        }
      }
      if (!match && b.input && typeof b.input === 'object') {
        // Relative paths with ".." that leave the run folder, resolved from the repo (where the agent starts).
        if (typeof b.input.command === 'string' && leavesRunFolder(normalizeText(b.input.command), repoDir, run)) match = 'relativeEscape';
        for (const [k, v] of Object.entries(b.input)) {
          if (match || !PATH_KEYS.has(k) || typeof v !== 'string') continue;
          const p = normalizeText(v);
          if (climbs({ text: p, quoted: false })) {
            const resolved = posixNormalize(isAbs(p) ? p : `${repoDir}/${p}`);
            if (resolved !== run && !resolved.startsWith(`${run}/`)) match = 'relativeEscape';
          }
        }
      }
      if (match) {
        const i = b.input;
        const shown = i && typeof i === 'object' ? (i.command ?? i.file_path ?? i.path ?? joined) : joined;
        return { match, tool: b.name || null, command: String(shown).slice(0, 200) };
      }
    }
  }
  return null;
}
