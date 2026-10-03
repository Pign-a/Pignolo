'use strict';
// Escáner de código inline (T7, R-9): uso de procesos fuera de literales y comentarios, y git nombrado.
const test = require('node:test');
const assert = require('node:assert');
const { inlineCallsGit } = require('../plugins/pignolo/lib/inline-calls');

const ROWS = [
  // [descripción, lenguaje, texto, niega]
  ['llamada fuera de literal con git literal', 'js', "require('child_process').execSync('git reset --hard')", true],
  ['la misma llamada dentro de una cadena que se guarda', 'js', "fs.writeFileSync('a.js', \"spawnSync('git', ['log'])\")", false],
  ['comentario // con la llamada', 'js', "// execSync('git status')\nconsole.log(1)", false],
  ['comentario /* */ con la llamada', 'js', "/* execSync('git status') */ console.log(1)", false],
  ['comillas sin cerrar: búsqueda ingenua y niega', 'js', "const s = 'git status; execSync(", true],
  ['plantilla con ${: no se puede tokenizar, niega', 'js', 'console.log(`${require("child_process").execSync("git reset --hard")}`)', true],
  ['plantilla sin ${ es un literal', 'js', 'console.log(`use git status`)', false],
  ['Python con triple comilla que guarda la llamada', 'py', "s = '''os.system('git clean -fdx')'''\nopen('a.py','w').write(s)", false],
  ['Python con la llamada fuera', 'py', "import os\nos.system('git clean -fdx')", true],
  ['Python f-string: la expresión es código, niega', 'py', 'print(f"{os.system(\'git clean\')}")', true],
  ['Python # comentario con la llamada', 'py', "# os.system('git clean')\nprint(1)", false],
  ['Ruby con backticks fuera de literal', 'rb', '`git reset --hard`', true],
  ['Perl system con git', 'pl', 'system("git reset --hard")', true],
  ['eval de una cadena con la llamada (H6)', 'js', "eval('require(\"child_process\").execSync(\"git reset --hard\")')", true],
  ['llamada por corchetes (H6)', 'js', "require('child_process')['execSync']('git reset --hard')", true],
  ['desestructurado con alias (H6)', 'js', "const {execSync: run}=require('child_process'); run('git reset --hard')", true],
  ['exec de Python (H6)', 'py', "exec('import os; os.system(\"git clean -fdx\")')", true],
  ['require con un nombre armado', 'js', "require(['child_','process'].join('')).execSync('git reset --hard')", true],
  ['comando armado por partes (g + it)', 'js', "require('child_process').execSync('g'+'it stash')", true],
  ['from os import system as s', 'py', "from os import system as s; s('git clean -fdx')", true],
  ['miembro por corchetes con nombre armado', 'js', "global['ev'+'al']('x'); // git", true],
  ['sin procesos y sin git, import os pasa', 'py', "import os\nprint(os.getcwd())", false],
  ['proceso que no es git pasa', 'js', "require('child_process').execSync('npm test')", false],
  ['sin procesos, git solo en una cadena, pasa', 'js', "s.replace('use git status','x')", false],
  ['llama a proceso y nombra el launcher', 'py', "import os; os.system('node hooks/launcher.js toggle')", true],
  ['lenguaje sin escáner: búsqueda ingenua', null, 'os.execute("git reset --hard")', true],
];

test('inlineCallsGit: tabla del escáner', () => {
  const bad = [];
  for (const [what, lang, text, deny] of ROWS) {
    const r = inlineCallsGit(text, lang, /launcher\.js/i);
    if (r.deny !== deny) bad.push(`${what}: ${r.deny} (${r.why}), esperado ${deny}`);
  }
  assert.deepStrictEqual(bad, []);
});
