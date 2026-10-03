// Plugin linter (spec §2 "Empaquetado", requirement R9). Runs in npm test over the
// real plugin; each rule has a red fixture in tests/lint-plugin.test.mjs.
// Returns [{ rule, file, message }] with plugin-relative posix paths.
import fs from 'node:fs';
import path from 'node:path';

const TOP_LEVEL = new Set(['.claude-plugin', 'skills', 'agents', 'scripts', 'lib', 'catalog', 'norms', 'reference', 'templates', 'tests',
  'README.md', 'CHANGELOG.md', 'CREDITS.md', 'LICENSE']);
// Folders whose files ship as runtime text (content rules apply). tests/ only gets the file rules.
const RUNTIME_DIRS = new Set(['skills', 'agents', 'scripts', 'lib', 'catalog', 'norms', 'reference', 'templates']);
const EXECUTABLE_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.node', '.wasm', '.bat', '.cmd', '.ps1', '.sh', '.com', '.msi', '.jar']);
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_MAX_CHARS = 12000; // ~3k tokens at ~4 chars per token
const HOME_CLAUDE = /~[\\/]\.claude\b/;

function walk(dir, base = dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

// Top-level "key: value" lines of a --- frontmatter block; raw values, not unquoted.
function frontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end < 0) return null;
  const fm = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line);
    if (m) fm[m[1]] = m[2].trim();
  }
  return fm;
}

function isQuoted(raw) {
  return /^"([^"\\]|\\.)*"$/.test(raw || '') || /^'([^']|'')*'$/.test(raw || '');
}

function unquote(raw) {
  return raw.slice(1, -1);
}

function isUtf8Text(buf) {
  if (buf.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

function checkSpecifier(spec) {
  if (spec.startsWith('node:')) return null;
  if (!spec.startsWith('./') && !spec.startsWith('../')) return `bare specifier "${spec}" (no npm dependencies)`;
  if (spec.includes('\\')) return `backslash in "${spec}"`;
  if (!/\.(mjs|js|json)$/.test(spec)) return `"${spec}" needs an explicit .mjs/.js/.json extension`;
  return null;
}

export function lintPlugin(root) {
  const findings = [];
  const add = (rule, file, message) => findings.push({ rule, file, message });

  // manifest + layout keys
  const manifestFile = path.join(root, '.claude-plugin', 'plugin.json');
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  } catch (e) {
    add('manifest', '.claude-plugin/plugin.json', `unreadable manifest (${e.message})`);
  }
  if (manifest) {
    if (manifest.name !== path.basename(root) || !KEBAB.test(manifest.name || '')) {
      add('manifest', '.claude-plugin/plugin.json', `name "${manifest.name}" must equal the folder name and be kebab-case`);
    }
    if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) add('manifest', '.claude-plugin/plugin.json', 'version must be semver x.y.z');
    for (const key of ['hooks', 'mcpServers', 'lspServers']) {
      if (manifest[key] !== undefined) add('layout', '.claude-plugin/plugin.json', `"${key}" is not allowed (no hooks, no servers)`);
    }
  }

  for (const ent of fs.readdirSync(root)) {
    if (!TOP_LEVEL.has(ent)) add('layout', ent, 'not part of the standard plugin layout');
  }

  const files = walk(root);
  for (const rel of files) {
    const base = path.posix.basename(rel);
    const top = rel.split('/')[0];
    const buf = fs.readFileSync(path.join(root, rel));
    if (/^(claude|agents)\.md$/i.test(base)) add('no-agent-context-files', rel, 'CLAUDE.md and AGENTS.md are never shipped');
    if (EXECUTABLE_EXT.has(path.posix.extname(base).toLowerCase()) || !isUtf8Text(buf)) {
      add('no-binaries', rel, 'binary or executable file');
      continue;
    }
    if (!RUNTIME_DIRS.has(top)) continue;
    const text = buf.toString('utf8');

    if (HOME_CLAUDE.test(text)) add('home-claude-path', rel, 'points into the user Claude folder; use ${CLAUDE_PLUGIN_ROOT} or arguments');

    if (/\.(mjs|js)$/.test(base)) {
      const re = /\b(?:import|export)\s[^'"`;]*?\bfrom\s*(['"])([^'"]+)\1|\bimport\s*(['"])([^'"]+)\3/g;
      for (const m of text.matchAll(re)) {
        const problem = checkSpecifier(m[2] || m[4]);
        if (problem) add('imports', rel, problem);
      }
      for (const m of text.matchAll(/\bimport\s*\(\s*([^)]*)\)/g)) {
        const arg = m[1].trim();
        const lit = /^(['"])([^'"]+)\1$/.exec(arg);
        if (lit) {
          const problem = checkSpecifier(lit[2]);
          if (problem) add('imports', rel, problem);
        } else if (!text.includes('pathToFileURL')) {
          add('imports', rel, 'dynamic import of a path without pathToFileURL (breaks on Windows)');
        }
      }
    }

    if (base.endsWith('.md')) {
      for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const clean = target.split('#')[0];
        if (/^([\\/~]|[A-Za-z]:)/.test(clean)) {
          add('md-links', rel, `absolute link "${target}"`);
          continue;
        }
        const resolved = path.resolve(root, path.dirname(rel), clean);
        const inside = path.relative(root, resolved);
        if (inside.startsWith('..') || path.isAbsolute(inside)) add('md-links', rel, `link "${target}" leaves the plugin`);
        else if (!fs.existsSync(resolved)) add('md-links', rel, `link "${target}" does not exist`);
      }
    }

    const isSkill = /^skills\/[^/]+\/SKILL\.md$/.test(rel);
    const isAgent = /^agents\/[^/]+\.md$/.test(rel);
    if (isSkill || isAgent) {
      if (/(^|[^\\])\$\d/m.test(text)) add('dollar-digit', rel, 'unescaped $<digit> is replaced by an argument; write \\$');
      if (/!`/.test(text)) add('bang-command', rel, '!`command` runs at load time and aborts the skill if it fails');
      const fm = frontmatter(text);
      const expectedName = isSkill ? rel.split('/')[1] : path.posix.basename(rel, '.md');
      const rule = isSkill ? 'skill-frontmatter' : 'agent-frontmatter';
      if (!fm) {
        add(rule, rel, 'missing --- frontmatter');
      } else {
        if (fm.name !== expectedName || !KEBAB.test(fm.name || '')) add(rule, rel, `name must be "${expectedName}" (kebab-case)`);
        if (!isQuoted(fm.description)) add(rule, rel, 'description must be a quoted YAML string');
        else if (unquote(fm.description).length > 1536) add(rule, rel, 'description longer than 1536 characters is truncated');
        // Lenguaje natural (2026-10-03): una skill puede o no llevar disable-model-invocation; la description dice cuándo usarla.
      }
      if (isSkill && text.length > SKILL_MAX_CHARS) add('skill-size', rel, `SKILL.md has ${text.length} characters (limit ~3k tokens)`);
    }
  }

  // every skills/<name>/ folder needs its SKILL.md
  const skillsDir = path.join(root, 'skills');
  if (fs.existsSync(skillsDir)) {
    for (const ent of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (ent.isDirectory() && !fs.existsSync(path.join(skillsDir, ent.name, 'SKILL.md'))) {
        add('skill-frontmatter', `skills/${ent.name}`, 'skill folder without SKILL.md');
      } else if (!ent.isDirectory()) {
        add('skill-frontmatter', `skills/${ent.name}`, 'skills/ holds one folder per skill');
      }
    }
  }
  return findings;
}
