// robots.txt reader (lib/robots.mjs, RFC 9309).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, isAllowed, matchPattern } from '../lib/robots.mjs';

const ROBOTS = [
  'User-agent: *',
  'Disallow: /admin',
  'Allow: /admin/public$',
  'Disallow: /*.pdf$',
  'Sitemap: https://www.example.com/sitemap.xml',
  '',
  'User-agent: Googlebot',
  'Disallow: /',
  '',
].join('\n');

test('parseRobots: groups, rules with line numbers and sitemaps', () => {
  const r = parseRobots(ROBOTS);
  assert.equal(r.groups.length, 2);
  assert.deepEqual(r.groups[0].agents, ['*']);
  assert.deepEqual(r.groups[0].rules.map((x) => [x.allow, x.pattern, x.line]), [[false, '/admin', 2], [true, '/admin/public$', 3], [false, '/*.pdf$', 4]]);
  assert.deepEqual(r.sitemaps, [{ url: 'https://www.example.com/sitemap.xml', line: 5 }]);
});

test('isAllowed evaluates the * group: longest match wins, allow wins a tie', async (t) => {
  const r = parseRobots(ROBOTS);
  const CASES = [['/', true], ['/admin', false], ['/admin/x', false], ['/admin/public', true], ['/admin/public/x', false],
    ['/a.pdf', false], ['/a.pdf?x=1', true], ['/robots.txt', true]];
  for (const [p, allowed] of CASES) await t.test(p, () => assert.equal(isAllowed(r, p).allowed, allowed));
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow: /x\nAllow: /x'), '/x').allowed, true);
  assert.equal(isAllowed(parseRobots('User-agent: *\nDisallow:'), '/').allowed, true); // empty disallow is no rule
  assert.equal(isAllowed(parseRobots('User-agent: a\nUser-agent: *\nDisallow: /p'), '/p').allowed, false); // shared group
  assert.equal(isAllowed(parseRobots('User-agent: Googlebot\nDisallow: /'), '/').allowed, true); // no * group
  assert.equal(isAllowed(parseRobots('\uFEFFUser-agent: *\r\nDisallow: / # all\r\n'), '/x').rule.line, 2);
});

test('matchPattern: * and $ without regex, linear on long inputs', () => {
  assert.equal(matchPattern('/a*b$', '/axxb'), true);
  assert.equal(matchPattern('/a*b$', '/axxbc'), false);
  assert.equal(matchPattern('/a*b', '/axxbc'), true);
  assert.equal(matchPattern('/*.css$', '/x/y.css'), true);
  const start = Date.now();
  assert.equal(matchPattern(`/${'*a'.repeat(2000)}b$`, `/${'a'.repeat(5000)}`), false);
  assert.ok(Date.now() - start < 2000, 'pattern matching must stay linear-ish');
});
