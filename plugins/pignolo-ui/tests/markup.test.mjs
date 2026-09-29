import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkup, staticText, ancestors, descendants } from '../lib/markup.mjs';

const html = (t) => parseMarkup(t, { syntax: 'html' });
const jsx = (t) => parseMarkup(t, { syntax: 'jsx' });

test('markup html nesting', () => {
  const m = html('<button aria-label="Cerrar"><svg aria-hidden="true"></svg></button>');
  assert.equal(m.elements.length, 2);
  const [button, svg] = m.elements;
  assert.equal(button.tag, 'button');
  assert.equal(svg.parent, button.index);
  assert.deepEqual(button.children, [svg.index]);
  assert.deepEqual(button.attrs.get('aria-label'), { value: 'Cerrar', dynamic: false, line: 1 });
  assert.deepEqual(ancestors(m, svg).map((e) => e.tag), ['button']);
  assert.deepEqual(descendants(m, button).map((e) => e.tag), ['svg']);
});

test('markup html void elements and lines', () => {
  const m = html('<img src="a.png">\n<p>Hola</p>');
  assert.deepEqual(m.elements.map((e) => [e.tag, e.line, e.parent]), [['img', 1, null], ['p', 2, null]]);
  assert.equal(m.elements[0].children.length, 0);
  assert.equal(m.elements[1].textParts[0].text, 'Hola');
  assert.equal(m.elements[1].textParts[0].line, 2);
});

test('markup html attributes: boolean, unquoted, case', () => {
  const [inp] = html("<INPUT Disabled type=text data-X='a b'>").elements;
  assert.equal(inp.tag, 'input');
  assert.deepEqual(inp.attrs.get('disabled'), { value: null, dynamic: false, line: 1 });
  assert.equal(inp.attrs.get('type').value, 'text');
  assert.equal(inp.attrs.get('data-x').value, 'a b');
});

test('markup html root, title and raw script/style', () => {
  const m = html('<html lang="es"><head><title>T</title><style>a { color: red }\n</style><script>if (a < b) { x() }</script></head></html>');
  assert.equal(m.hasHtmlRoot, true);
  assert.deepEqual(m.styles, [{ text: 'a { color: red }\n', line: 1 }]);
  assert.deepEqual(m.elements.map((e) => e.tag), ['html', 'head', 'title', 'style', 'script']);
  assert.equal(m.elements[4].textParts[0].text, 'if (a < b) { x() }');
  assert.equal(m.exportsText, null);
});

test('markup html style line is the line of its content', () => {
  const m = html('<html>\n<head>\n<style>\n.a{}\n</style>');
  assert.equal(m.styles[0].line, 3);
});

test('markup html comments are ignored, entities decoded', () => {
  const m = html('<!-- <button></button> -->\n<p>a &amp; b</p>');
  assert.deepEqual(m.elements.map((e) => e.tag), ['p']);
  assert.equal(m.elements[0].textParts[0].text, 'a & b');
});

test('markup html implied end tags', () => {
  const m = html('<ul><li>a<li>b</ul>');
  assert.deepEqual(m.elements.map((e) => [e.tag, e.parent]), [['ul', null], ['li', 0], ['li', 0]]);
});

test('markup jsx component, dynamic text, handler', () => {
  const [b] = jsx('<Button onClick={go}>{label}</Button>').elements;
  assert.equal(b.tag, 'Button');
  assert.equal(b.component, true);
  assert.equal(b.attrs.get('onclick').dynamic, true);
  assert.equal(b.textParts[0].dynamic, true);
  const m = jsx('<Button>{label}</Button>');
  assert.equal(staticText(m, m.elements[0]).dynamic, true);
});

test('markup jsx member component and lowercase intrinsic', () => {
  const m = jsx('<Foo.Bar><div /></Foo.Bar>');
  assert.deepEqual(m.elements.map((e) => [e.tag, e.component, e.selfClosing]), [['Foo.Bar', true, false], ['div', false, true]]);
});

test('markup jsx spread', () => {
  const [i] = jsx('<input {...props} />').elements;
  assert.equal(i.spread, true);
  assert.equal(i.selfClosing, true);
});

test('markup jsx attribute normalization', () => {
  const [l] = jsx('<label htmlFor="e" className="a b" aria-Label={"x"} title={t} hidden>E</label>').elements;
  assert.equal(l.attrs.get('for').value, 'e');
  assert.equal(l.attrs.get('class').value, 'a b');
  assert.deepEqual([l.attrs.get('aria-label').value, l.attrs.get('aria-label').dynamic], ['x', false]);
  assert.equal(l.attrs.get('title').dynamic, true);
  assert.deepEqual([l.attrs.get('hidden').value, l.attrs.get('hidden').dynamic], [null, false]);
});

test('markup jsx string expression is static text', () => {
  const m = jsx("<p>{'Hola'}</p>");
  assert.deepEqual(staticText(m, m.elements[0]), { text: 'Hola', dynamic: false });
});

test('markup jsx staticText: nested, aria-hidden, mixed', () => {
  const m = jsx('<a>Ir <b>ya</b><span aria-hidden="true">x</span></a>');
  assert.deepEqual(staticText(m, m.elements[0]), { text: 'Ir ya x', dynamic: false });
  assert.deepEqual(staticText(m, m.elements[0], { skipAriaHidden: true }), { text: 'Ir ya', dynamic: false });
  const c = jsx('<a>Ir <Icon /></a>');
  assert.deepEqual(staticText(c, c.elements[0]), { text: 'Ir', dynamic: true });
});

test('markup jsx elements inside expressions', () => {
  const m = jsx('<ul>{items.map((i) => <li key={i}>{i}</li>)}{ok && <b>x</b>}</ul>');
  assert.deepEqual(m.elements.map((e) => [e.tag, e.parent]), [['ul', null], ['li', 0], ['b', 0]]);
});

test('markup jsx element in attribute is detached', () => {
  const m = jsx('<A icon={<svg />}>t</A>');
  assert.deepEqual(m.elements.map((e) => [e.tag, e.parent]), [['A', null], ['svg', null]]);
  assert.deepEqual(m.elements[0].children, []);
});

test('markup jsx fragments are transparent', () => {
  const m = jsx('<><p>a</p><p>b</p></>');
  assert.deepEqual(m.elements.map((e) => [e.tag, e.parent]), [['p', null], ['p', null]]);
});

test('markup jsx html root, comments and lines', () => {
  const m = jsx('export default function L() {\n  return (\n    <html lang="es">\n      {/* <button/> */}\n      <body><p>x</p></body>\n    </html>\n  );\n}');
  assert.equal(m.hasHtmlRoot, true);
  assert.deepEqual(m.elements.map((e) => [e.tag, e.line]), [['html', 3], ['body', 5], ['p', 5]]);
});

test('markup jsx exportsText', () => {
  const m = jsx("export const metadata = { title: 'Pedidos' };\nexport const viewport = { maximumScale: 1 };\nexport default function P() { return <p>x</p>; }");
  assert.ok(m.exportsText.includes("title: 'Pedidos'"));
  assert.ok(m.exportsText.includes('maximumScale: 1'));
  assert.ok(!m.exportsText.includes('function P'));
  assert.equal(jsx('const a = 1;').exportsText, null);
});

test('markup jsx style with template literal', () => {
  const m = jsx('<div>\n<style>{`\n.a { color: red }\n`}</style>\n<style>{`.b { color: ${c} }`}</style></div>');
  assert.equal(m.styles.length, 1);
  assert.equal(m.styles[0].text, '\n.a { color: red }\n');
  assert.equal(m.styles[0].line, 2);
});

test('markup BOM does not shift lines', () => {
  const a = html('<p>a</p>\n<p>b</p>');
  const b = html('' + String.fromCharCode(0xFEFF) + '<p>a</p>\n<p>b</p>');
  assert.deepEqual(b.elements.map((e) => e.line), a.elements.map((e) => e.line));
  assert.deepEqual(jsx('' + String.fromCharCode(0xFEFF) + '<p>a</p>\n<p>b</p>').elements.map((e) => e.line), [1, 2]);
});

test('markup CRLF lines', () => {
  assert.deepEqual(html('<p>a</p>\r\n<p>b</p>\r\n<p>c</p>').elements.map((e) => e.line), [1, 2, 3]);
});

test('markup text with a lone less-than does not break', () => {
  for (const syntax of ['html', 'jsx']) {
    const m = parseMarkup('<p>a < b</p><i>z</i>', { syntax });
    assert.deepEqual(m.elements.map((e) => e.tag), ['p', 'i'], syntax);
    assert.equal(staticText(m, m.elements[0]).text, 'a < b', syntax);
  }
});

test('markup jsx generics and comparisons in code are not elements', () => {
  const m = jsx('const [a] = useState<string>("");\nif (a < b && c > d) {}\nconst x = <p>ok</p>;');
  assert.deepEqual(m.elements.map((e) => e.tag), ['p']);
  assert.equal(m.elements[0].line, 3);
});

test('markup never throws on garbage', () => {
  for (const syntax of ['html', 'jsx']) {
    for (const t of ['', '<', '<div', '<div a="x', '</p>', '<a {', '{{{', '<>', '<p>{`', '<!--', 'export const metadata = {']) {
      assert.doesNotThrow(() => parseMarkup(t, { syntax }), `${syntax}: ${t}`);
    }
  }
});
