// XML well-formedness and sitemap shape (lib/xml-check.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkXml, checkSitemap } from '../lib/xml-check.mjs';

const SITEMAP = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://www.example.com/?a=1&amp;b=2</loc><lastmod>2026-09-01</lastmod></url>\n</urlset>\n';

test('checkXml: well-formed documents pass', async (t) => {
  const CASES = [
    ['declaration and namespace', SITEMAP],
    ['BOM', '\uFEFF<?xml version="1.0"?><a/>'],
    ['comments and PI', '<!-- c --><?pi x?><a><!-- d --><b x="1" y=\'2\'/></a>'],
    ['CDATA', '<a><![CDATA[<not a tag> & raw]]></a>'],
    ['numeric references', '<a>&#233;&#xE9;&lt;&gt;&quot;&apos;</a>'],
    ['DOCTYPE without subset', '<!DOCTYPE a><a/>'],
  ];
  for (const [name, xml] of CASES) await t.test(name, () => assert.deepEqual(checkXml(xml).ok, true, JSON.stringify(checkXml(xml))));
});

test('checkXml: errors with their line', async (t) => {
  const CASES = [
    ['unclosed root', '<a>\n<b></b>\n', /unclosed element <a>/, 3],
    ['crossed tags', '<a><b></a></b>', /closing <\/a> does not match <b>/, 1],
    ['two roots', '<a/>\n<b/>', /more than one root/, 2],
    ['text outside', 'hola<a/>', /text outside the root/, 1],
    ['raw ampersand', '<a>\nx & y</a>', /invalid entity reference/, 2],
    ['raw <', '<a>1 < 2</a>', /invalid tag|raw </, 1],
    ['duplicate attribute', '<a x="1" x="2"/>', /duplicate attribute x/, 1],
    ['unquoted attribute', '<a x=1/>', /unquoted attribute x/, 1],
    ['empty', '', /no root element/, 1],
    ['internal subset', '<!DOCTYPE a [<!ENTITY e "x">]><a/>', /internal subset not supported/, 1],
    ['html', '<!doctype html><html></html>', /invalid tag/, 1],
  ];
  for (const [name, xml, error, line] of CASES) {
    await t.test(name, () => {
      const r = checkXml(xml);
      assert.equal(r.ok, false);
      assert.match(r.error, error);
      assert.equal(r.line, line);
    });
  }
});

test('checkSitemap: urlset or sitemapindex, each item with a loc', () => {
  assert.deepEqual(checkSitemap(SITEMAP), { ok: true, kind: 'urlset', count: 1 });
  assert.deepEqual(checkSitemap('<sitemapindex><sitemap><loc>https://e.com/s1.xml</loc></sitemap></sitemapindex>'), { ok: true, kind: 'sitemapindex', count: 1 });
  assert.deepEqual(checkSitemap('<s:urlset xmlns:s="x"><s:url><s:loc>u</s:loc></s:url></s:urlset>'), { ok: true, kind: 'urlset', count: 1 });
  assert.deepEqual(checkSitemap('<urlset><url><loc><![CDATA[https://e.com/]]></loc></url></urlset>'), { ok: true, kind: 'urlset', count: 1 });
  assert.match(checkSitemap('<urlset><url><lastmod>x</lastmod></url></urlset>').error, /<url> without <loc>/);
  assert.match(checkSitemap('<urlset><url><loc>  </loc></url></urlset>').error, /<url> without <loc>/);
  assert.match(checkSitemap('<rss><channel/></rss>').error, /not urlset or sitemapindex/);
});

test('linear cost: 50 000 urls and 20 000 nested elements stay fast', () => {
  const big = `<urlset>${'<url><loc>https://example.com/p</loc></url>'.repeat(50000)}</urlset>`;
  const deep = `${'<a>'.repeat(20000)}${'</a>'.repeat(20000)}`;
  const start = Date.now();
  assert.equal(checkSitemap(big).count, 50000);
  assert.equal(checkXml(deep).ok, true);
  assert.ok(Date.now() - start < 3000, `took ${Date.now() - start} ms`);
});
