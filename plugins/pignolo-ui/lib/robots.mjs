// robots.txt reader (RFC 9309, 2022-09): groups, allow/disallow with `*` and `$`, sitemaps.
// Only the group(s) for `*` are evaluated (declared: specific crawlers are not modeled).
//
// parseRobots(text) -> { groups: [{ agents, rules: [{ allow, pattern, line }] }], sitemaps: [{ url, line }] }
// isAllowed(robots, path) -> { allowed, rule }   rule = the deciding rule or null
// matchPattern(pattern, path) -> boolean          `*` = any run of characters, final `$` = end
//
// Never uses RegExp built from the file: a long pattern with many `*` stays O(n*m).

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  const lines = String(text ?? '').replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) return;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      return;
    }
    lastWasAgent = false;
    if (key === 'sitemap') { if (value) sitemaps.push({ url: value, line: i + 1 }); return; }
    if ((key === 'allow' || key === 'disallow') && current) {
      if (value === '') return; // an empty disallow is no rule
      current.rules.push({ allow: key === 'allow', pattern: value, line: i + 1 });
    }
  });
  return { groups, sitemaps };
}

// Iterative wildcard match with backtracking to the last `*` only: O(len(path) * len(pattern)).
export function matchPattern(pattern, path) {
  let p = pattern;
  let anchored = false;
  if (p.endsWith('$')) { anchored = true; p = p.slice(0, -1); }
  if (!anchored) p += '*';
  let i = 0; // path
  let j = 0; // pattern
  let star = -1;
  let mark = 0;
  while (i < path.length) {
    if (j < p.length && p[j] !== '*' && p[j] === path[i]) { i++; j++; }
    else if (j < p.length && p[j] === '*') { star = j++; mark = i; }
    else if (star >= 0) { j = star + 1; i = ++mark; }
    else return false;
  }
  while (j < p.length && p[j] === '*') j++;
  return j === p.length;
}

export function isAllowed(robots, path) {
  if (path === '/robots.txt') return { allowed: true, rule: null };
  const rules = robots.groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules);
  let best = null;
  for (const r of rules) {
    if (!matchPattern(r.pattern, path)) continue;
    const len = r.pattern.length;
    if (!best || len > best.pattern.length || (len === best.pattern.length && r.allow && !best.allow)) best = r;
  }
  return { allowed: best ? best.allow : true, rule: best };
}
