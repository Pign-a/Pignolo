'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', 'plugins', 'pignolo');
const DIR = path.join(PLUGIN, 'skills', 'ui');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n');
const skill = () => read(DIR, 'SKILL.md');
const template = () => read(DIR, 'templates', 'index.html');
const paragraphs = (t) => t.split(/\n\s*\n/);

function agent() {
  const t = read(PLUGIN, 'agents', 'ui-option.md');
  const m = t.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(m, 'ui-option: sin frontmatter');
  const data = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return { data, body: m[2] };
}

// ---- plantilla index.html ----
test('la plantilla tiene el bloque de datos y las dos palabras de estado', () => {
  const t = template();
  assert.match(t, /<script id="data" type="application\/json">/);
  assert.ok(t.includes('decidido'));
  assert.ok(t.includes('pendiente'));
});

test('la plantilla abre con doble clic: sin fetch ni recursos remotos', () => {
  const t = template();
  assert.ok(!t.includes('fetch('));
  assert.ok(!t.includes('src="http'));
  assert.ok(!t.includes('href="http'));
  assert.ok(!/@import|fonts\.googleapis|url\(\s*["']?https?:/i.test(t), 'sin fuentes ni CSS remoto');
  assert.ok(!/XMLHttpRequest/.test(t));
});

test('el JSON embebido es válido y arranca vacío: ninguna pieza inventada como decidida', () => {
  const m = template().match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'no se encuentra el bloque de datos');
  const data = JSON.parse(m[1]);
  assert.ok(Array.isArray(data.pieces));
  assert.deepStrictEqual(data.pieces, [], 'el índice nuevo no trae piezas de ejemplo');
  // La forma de una pieza queda documentada en el comentario, con el nombre de carpeta en inglés.
  const comment = template().match(/<!-- Datos de las piezas[\s\S]*?-->/);
  assert.ok(comment, 'falta el comentario sobre el bloque de datos');
  assert.match(comment[0], /"options": \["options\/identity\/a\.html"/);
  assert.match(comment[0], /solo rutas relativas/);
  assert.ok(!/identidad\/|navegacion\//.test(template()), 'nombres de carpeta en español en la plantilla');
});

test('la plantilla lee el JSON y dibuja la lista con el resumen, y respeta claro/oscuro', () => {
  const t = template();
  assert.match(t, /getElementById\(['"]data['"]\)/);
  assert.match(t, /JSON\.parse/);
  assert.match(t, /prefers-color-scheme:\s*dark/);
  assert.match(t, /name="viewport"/);
  assert.match(t, /<meta charset="utf-8">/);
});

test('la plantilla evita los patrones prohibidos sin dirección de diseño', () => {
  const t = template();
  assert.ok(!/border-radius:\s*(999|9999)px/.test(t), 'sin botones en píldora');
  assert.ok(!/font-style:\s*italic/.test(t));
  assert.ok(!/monospace/i.test(t));
  assert.ok(!/\b0[1-3]\s*[\/.]/.test(t), 'sin etiquetas numeradas');
});

// ---- SKILL.md ----
test('la description trae las frases naturales, en una línea y entre comillas', () => {
  const m = skill().match(/^description:[ \t]*(.*)$/m);
  assert.ok(m && m[1].trim().length > 40);
  assert.ok(m[1].includes('definamos el diseño'));
  assert.ok(m[1].includes('design the screen'));
  assert.ok(m[1].trim().startsWith('"') && m[1].trim().endsWith('"'));
});

test('SKILL.md menciona el catálogo, el navegador, la ruta "interfaz primero" y sus references', () => {
  const t = skill();
  assert.ok(t.includes('design/components'));
  assert.ok(t.includes('index.html'));
  assert.ok(t.includes('interfaz primero'));
  for (const r of ['references/identity.md', 'references/catalog.md', 'references/options.md', 'templates/index.html']) {
    assert.ok(t.includes(r), `falta ${r}`);
  }
});

test('las tres opciones son solo para piezas grandes; un botón o un título no las llevan', () => {
  const par = paragraphs(skill()).find((p) => /three options/i.test(p) && /button/i.test(p));
  assert.ok(par, 'falta el párrafo de las tres opciones');
  assert.match(par, /only/i);
  for (const big of ['identity', 'nav', 'modal', 'sidebar', 'table']) {
    assert.match(par, new RegExp(big, 'i'), `falta pieza grande ${big}`);
  }
  assert.match(par, /button/i);
  assert.match(par, /title/i);
});

test('el estado decidido/pendiente vive en los datos embebidos y el agente regenera el index', () => {
  const t = skill();
  assert.match(t, /decidido/);
  assert.match(t, /pendiente/);
  assert.match(t, /regenerat/i);
  assert.match(t, /embedded/i);
});

test('el catálogo se reutiliza: nunca el calendario o el selector nativo; por convención, sin bloquear', () => {
  const t = skill();
  assert.match(t, /native/i);
  assert.match(t, /calendar/i);
  assert.match(t, /convention/i);
  assert.match(t, /ui-audit/);
  assert.match(t, /nothing blocks/i);
});

test('qué se diseña se deduce de roadmap.md; design.md conserva el nombre existente', () => {
  const t = skill();
  assert.match(t, /roadmap\.md/);
  assert.match(t, /DESIGN\.md/);
  assert.match(t, /design\.md/);
});

test('nada se publica fuera de la máquina', () => {
  assert.match(skill(), /never published|nothing is published|stays on the machine/i);
});

test('references: identity cubre estados y gusto; catalog la estructura; options la disciplina', () => {
  const id = read(DIR, 'references', 'identity.md');
  for (const w of ['palette', 'typography', 'animation', 'navigation', 'icons', 'hover', 'focus', 'disabled', 'loading']) {
    assert.match(id, new RegExp(w, 'i'), `identity: falta ${w}`);
  }
  assert.match(id, /roadmap\.md/);
  assert.match(id, /screenshots?/i);
  const cat = read(DIR, 'references', 'catalog.md');
  assert.ok(cat.includes('design/components'));
  assert.match(cat, /interfaz primero/);
  const op = read(DIR, 'references', 'options.md');
  assert.match(op, /a\.html/);
  assert.match(op, /ui-option/);
});

// ---- agente ----
test('ui-option: tools es exactamente Write; model y effort explícitos; sin claves prohibidas', () => {
  const { data } = agent();
  assert.strictEqual(data.name, 'ui-option');
  assert.strictEqual(data.tools, 'Write');
  assert.strictEqual(data.model, 'sonnet');
  assert.strictEqual(data.effort, 'medium');
  assert.ok(data.description && data.description.length > 20);
  for (const k of ['hooks', 'permissionMode', 'mcpServers']) assert.ok(!(k in data), `clave prohibida ${k}`);
});

test('ui-option: genera HTML estático sin scripts ni recursos remotos y no repite referencias del plugin viejo', () => {
  const { body } = agent();
  assert.match(body, /ONE option/);
  assert.match(body, /no scripts/i);
  assert.match(body, /no remote/i);
  assert.ok(!/canvas|publish|leak/i.test(body), 'sin restos del lienzo ni de la publicación');
});

// ---- fix round 1: el script de la plantilla distingue vacío de dañado ----
const vm = require('node:vm');

function renderTemplate(dataText) {
  const html = template().replace(
    /(<script id="data" type="application\/json">)[\s\S]*?(<\/script>)/, (_, a, b) => `${a}${dataText}${b}`);
  const scripts = [...html.matchAll(/<script(?![^>]*id="data")[^>]*>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(scripts.length, 1, 'un solo script en línea además del de datos');
  const mk = () => ({
    children: [], textContent: '', className: '', attrs: {},
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
  });
  const els = {};
  const document = {
    createElement: (tag) => Object.assign(mk(), { tag }),
    getElementById: (id) => {
      if (id === 'data') return { textContent: dataText };
      return (els[id] = els[id] || mk());
    },
  };
  vm.runInNewContext(scripts[0][1], { document, String, JSON, Array });
  const texts = [];
  const links = [];
  const walk = (e) => {
    if (e.textContent) texts.push(e.textContent);
    if (e.tag === 'a') links.push(e.href);
    e.children.forEach(walk);
  };
  walk(els.list);
  return { text: texts.join('\n'), links };
}
const runTemplate = (dataText) => renderTemplate(dataText).text;

test('script de la plantilla: datos válidos dibujan las piezas', () => {
  const out = runTemplate('{"pieces":[{"name":"Navegación","status":"pendiente","options":["options/n/a.html"]}]}');
  assert.match(out, /Navegación/);
  assert.match(out, /pendiente/);
  assert.match(out, /Opción A/);
  assert.ok(!/Todavía no hay piezas/.test(out));
  assert.ok(!/dañados/.test(out));
});

test('script de la plantilla: "pieces": [] muestra el mensaje de lista vacía', () => {
  const out = runTemplate('{"pieces":[]}');
  assert.match(out, /Todavía no hay piezas/);
  assert.ok(!/dañados/.test(out));
});

test('script de la plantilla: un bloque dañado muestra el error y NO dice que no hay piezas', () => {
  const out = runTemplate('{"pieces":[{"name":"A","status":"decidido","options":[],}]}');
  assert.match(out, /dañados/);
  assert.match(out, /regenerar/);
  assert.ok(!/Todavía no hay piezas/.test(out), 'un registro dañado no es una lista vacía');
});

test('SKILL.md: al escribir el bloque de datos, `<` va como u003c escapado y se valida que parsee', () => {
  const t = skill();
  assert.ok(t.includes(String.fromCharCode(92) + 'u003c'));
  assert.match(t, /parses?/i);
});

// ---- revisión final F7: enlaces seguros y estado desconocido ----
const one = (opts, status = 'pendiente') =>
  JSON.stringify({ pieces: [{ name: 'Pieza', status, options: opts }] });

test('script de la plantilla: solo rutas relativas .html se vuelven enlace', () => {
  const r = renderTemplate(one(['options/nav/a.html', 'a.html', 'options/nav/b.html']));
  assert.deepStrictEqual(r.links, ['options/nav/a.html', 'a.html', 'options/nav/b.html']);
  assert.ok(!/ruta no válida/.test(r.text));
});

test('script de la plantilla: javascript:, URL absoluta, ruta absoluta o con .. se rechazan y se dice', () => {
  const bad = ['javascript:alert(1)', 'JavaScript:alert(1).html', 'https://example.com/a.html', '//example.com/a.html',
    '/etc/a.html', 'options/../../a.html', 'data:text/html,x.html', 'options/nav/a.txt', 'options/nav/a.html?x=1', 7];
  const r = renderTemplate(one(bad));
  assert.deepStrictEqual(r.links, [], 'ninguna ruta peligrosa se vuelve enlace');
  assert.strictEqual((r.text.match(/ruta no válida/g) || []).length, bad.length, 'cada ruta rechazada se avisa');
});

test('script de la plantilla: un estado desconocido se muestra tal cual, no como pendiente', () => {
  const r = renderTemplate(one([], 'en revision'));
  assert.match(r.text, /en revision/);
  assert.ok(!/\bpendiente\b/.test(r.text), 'el estado desconocido se leyó como pendiente');
  const missing = renderTemplate(JSON.stringify({ pieces: [{ name: 'Pieza', options: [] }] }));
  assert.match(missing.text, /sin estado/);
});

// ---- revisión final F8: la carpeta de una opción no está vacía mientras se escriben las otras ----
test('ui-option y options.md: la carpeta contiene solo los archivos nombrados; los estados incluyen loading', () => {
  const { body } = agent();
  const rule = body.split('\n').find((l) => l.startsWith('3. Write only to the folder'));
  assert.ok(rule, 'falta la regla de la carpeta');
  assert.match(rule, /contains only the files named for you \(other options are written in parallel\)/);
  assert.ok(!/folder is empty/i.test(body), 'el agente sigue diciendo que la carpeta está vacía');
  const states = body.split('\n').find((l) => l.startsWith('9. Show states'));
  assert.match(states, /pressed, disabled and loading/);
  const op = read(DIR, 'references', 'options.md');
  const bullet = op.split('\n').find((l) => l.startsWith('- The folder to write into'));
  assert.ok(bullet, 'falta el ítem de la carpeta');
  assert.match(bullet, /contains only the files named/);
  assert.match(bullet, /in parallel/);
  assert.ok(!/, empty,/.test(bullet), 'options.md sigue diciendo que la carpeta está vacía');
});

// ---- armado de pantallas: brief, ficha de patrón y crítica ----
const STEP_REFS = ['brief', 'patterns', 'critique'];
const section = (name) => skill().split(/^## /m).find((s) => new RegExp(`^\\d+\\. ${name}\\n`).test(s));
const pluginFiles = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pluginFiles(p, acc); else acc.push(p);
  }
  return acc;
};

test('"Building screens" va después de Options y antes del navegador; las secciones viejas conservan su sentido', () => {
  const heads = [...skill().matchAll(/^## (\d+)\. (.+)$/gm)].map((m) => `${m[1]}. ${m[2]}`);
  assert.deepStrictEqual(heads, ['1. Start from what exists', '2. Identity phase (first, when the project has an interface)',
    '3. Catalog', '4. Options', '5. Building screens', '6. The navigator', '7. Close']);
  assert.match(skill(), /three options \(section 4\)/, 'la referencia a Options sigue apuntando a la sección 4');
});

test('Building screens: tres pasos, cada uno en UNA línea con su referencia; sin tabla ni numeración de pasos', () => {
  const sec = section('Building screens');
  assert.ok(sec, 'falta la sección');
  const bullets = sec.split('\n').filter((l) => l.startsWith('- '));
  assert.strictEqual(bullets.length, 3);
  for (const r of STEP_REFS) {
    const lines = skill().split('\n').filter((l) => l.includes(`references/${r}.md`));
    assert.strictEqual(lines.length, 1, `references/${r}.md debe aparecer en exactamente una línea`);
    assert.ok(lines[0].startsWith('- **'), `${r}: la línea es un ítem de la sección`);
  }
  assert.ok(!/^\|/m.test(sec), 'sin tabla que nombre los pasos');
  assert.ok(!/step missing|missing from this list/i.test(skill()));
  assert.ok(!/\bsections? \d/.test(sec), 'las secciones se citan por nombre, no por número');
  // la intro no nombra los pasos ni sus archivos: con un paso quitado sigue siendo coherente
  const intro = sec.split('\n').filter((l) => !l.startsWith('- ')).join('\n');
  assert.ok(!/brief|pattern sheet|critique|rubric/i.test(intro), 'la intro nombra un paso');
});

test('Building screens: el brief decide el trabajo, la ficha investiga con contexto, la crítica corrige solo lo que falla', () => {
  const [brief, pattern, critique] = STEP_REFS.map((r) => section('Building screens').split('\n').find((l) => l.includes(`references/${r}.md`)));
  for (const w of ['user', 'job', 'primary action', '3 key data', 'left out', 'reading order', 'text']) assert.match(brief, new RegExp(w, 'i'), `brief: falta ${w}`);
  assert.match(pattern, /design\/patterns\//);
  assert.match(pattern, /context/i);
  assert.match(pattern, /tokens always win/i);
  assert.match(critique, /once/i);
  assert.match(critique, /screenshot/i);
  assert.match(critique, /only the items that fail/i);
  assert.match(critique, /never what passes/i);
});

test('Building screens: la proporcionalidad son dos frases llanas (retoque salta, pieza o pantalla nueva corre)', () => {
  const para = section('Building screens').split(/\n\s*\n/).find((p) => /small tweak/i.test(p));
  assert.ok(para, 'falta la regla de proporcionalidad');
  assert.match(para, /small tweak skips/i);
  assert.match(para, /new piece or screen runs/i);
  assert.ok(!para.includes('|'));
});

test('references del flujo: cada ruta de paso solo se nombra en SKILL.md y no se nombran entre sí', () => {
  const refs = path.join(DIR, 'references');
  const text = Object.fromEntries(STEP_REFS.map((r) => [r, read(refs, `${r}.md`)]));
  for (const r of STEP_REFS) {
    for (const other of STEP_REFS.filter((o) => o !== r)) {
      assert.ok(!text[r].includes(`${other}.md`), `${r}.md nombra ${other}.md`);
    }
    // ningún otro archivo del plugin nombra la ruta del paso
    const files = pluginFiles(PLUGIN).filter((f) => /\.(md|json|html|mjs|js)$/.test(f))
      .filter((f) => !path.relative(PLUGIN, f).split(path.sep).join('/').startsWith('skills/ui/references/patterns/')) // las fichas viajan con su paso
      .filter((f) => read(f).includes(`references/${r}.md`));
    assert.deepStrictEqual(files.map((f) => path.relative(PLUGIN, f).split(path.sep).join('/')), ['skills/ui/SKILL.md']);
  }
  // el único vínculo permitido es condicional
  assert.match(text.critique, /brief if there is one/);
});

test('brief.md: usuario, trabajo, una acción primaria, hasta 3 datos, lo que se deja afuera y regiones en texto', () => {
  const t = read(DIR, 'references', 'brief.md');
  for (const w of ['User', 'Job', 'Primary action', 'Key data', 'Left out on purpose', 'Regions']) assert.match(t, new RegExp(`\\*\\*${w}\\*\\*`), `falta ${w}`);
  assert.match(t, /two screens/);
  assert.match(t, /up to 3/);
  assert.match(t, /reading order/);
  assert.match(t, /No wireframe file/);
  assert.match(t, /starting guidance, not a gate/, 'los límites numéricos son guía y no bloquean');
});

test('patterns.md: orden de búsqueda, investigar con el contexto de la pieza, model y effort explícitos, design.md gana', () => {
  const t = read(DIR, 'references', 'patterns.md');
  const iProject = t.indexOf('`design/patterns/`');
  const iPlugin = t.indexOf('`references/patterns/`');
  assert.ok(iProject > 0 && iPlugin > iProject, 'primero el proyecto, después el plugin');
  assert.match(t, /WITH the context of the piece/);
  assert.match(t, /`model` and `effort` passed explicitly/);
  assert.match(t, /tokens always win over a sheet's measures/);
  assert.match(t, /`convention`/);
  // la línea de las fichas del plugin es una sola: quitarla basta para el brazo sin semillas
  assert.strictEqual(t.split('\n').filter((l) => l.includes('references/patterns/')).length, 1);
});

test('critique.md: cinco ítems sí/no, cada uno con el síntoma que previene; solo se corrigen los "no"', () => {
  const t = read(DIR, 'references', 'critique.md');
  const items = t.split('\n').filter((l) => /^\d\. \*\*/.test(l));
  assert.strictEqual(items.length, 5);
  for (const l of items) assert.match(l, /Prevents/, `sin síntoma: ${l.slice(0, 30)}`);
  const joined = items.join('\n');
  assert.match(joined, /matches the brief if there is one/);
  assert.match(joined, /Exactly one primary-styled action per view, and it is the most prominent/);
  assert.match(joined, /detail blurred, title, section, body and caption read in that order, with at most 4 text roles per region/);
  assert.match(joined, /outside the job and the key data/);
  assert.match(joined, /Whitespace separates regions and proximity groups related items/);
  assert.match(t, /screenshot/);
  assert.match(t, /fix only the ones that fail/);
  assert.match(t, /no second pass/);
});
