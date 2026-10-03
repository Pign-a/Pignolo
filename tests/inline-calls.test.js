'use strict';
// Escáner de código inline (T7, R-9; lista blanca desde la pasada RT2-01 a RT2-04): pasa solo lo que no menciona procesos (una mención en una cadena cuenta, en un comentario no), no carga módulos fuera de la lista y no toca .git.
const test = require('node:test');
const assert = require('node:assert');
const { inlineCallsGit } = require('../plugins/pignolo/lib/inline-calls');

const ROWS = [
  // [descripción, lenguaje, texto, niega]
  ['llamada fuera de literal con git literal', 'js', "require('child_process').execSync('git reset --hard')", true],
  ['una llamada dentro de una cadena que se guarda se niega (RT2: ninguna mención, ni en cadenas)', 'js', "fs.writeFileSync('a.js', \"spawnSync('git', ['log'])\")", true],
  ['comentario // con la llamada', 'js', "// execSync('git status')\nconsole.log(1)", false],
  ['comentario /* */ con la llamada', 'js', "/* execSync('git status') */ console.log(1)", false],
  ['comillas sin cerrar: búsqueda ingenua y niega', 'js', "const s = 'git status; execSync(", true],
  ['plantilla con ${: no se puede tokenizar, niega', 'js', 'console.log(`${require("child_process").execSync("git reset --hard")}`)', true],
  ['plantilla sin ${ es un literal', 'js', 'console.log(`use git status`)', false],
  ['Python con triple comilla que guarda la llamada se niega (RT2)', 'py', "s = '''os.system('git clean -fdx')'''\nopen('a.py','w').write(s)", true],
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
  ['proceso que no es git se niega (RT2-01: el código inline no lanza procesos)', 'js', "require('child_process').execSync('npm test')", true],
  ['sin procesos, git solo en una cadena, pasa', 'js', "s.replace('use git status','x')", false],
  ['llama a proceso y nombra el launcher', 'py', "import os; os.system('node hooks/launcher.js toggle')", true],
  ['lenguaje sin escáner: búsqueda ingenua', null, 'os.execute("git reset --hard")', true],
  // Pasada de arreglos RT2-01 a RT2-04: lista blanca de lo inocuo.
  ['solo calcula: lee un directorio', 'js', "console.log(require('fs').readdirSync('.').length)", false],
  ['solo calcula: Python con json', 'py', "import json; print(json.dumps({'a': 1}))", false],
  ['console.log de la cadena .git no toca la ruta', 'js', "console.log('.git')", false],
  ['escribir en .git es tocar la ruta', 'js', "require('fs').writeFileSync('.git/config', 'x')", true],
  ['require de un módulo fuera de la lista', 'js', "require('./x')", true],
  ['require armado con +', 'js', "const r = require; r('child_' + 'process')", true],
  ['process.binding', 'js', "process.binding('spawn_sync')", true],
  ['execa', 'js', "require('execa').execaSync('ls')", true],
  ['import git (GitPython)', 'py', "import git; git.Repo('.')", true],
  ['importlib', 'py', "import importlib; importlib.import_module('x')", true],
  ['os.__dict__ con nombre armado', 'py', "import os; os.__dict__['sys' + 'tem']('x')", true],
  ['una comilla en una regex esconde la llamada (RT2-04)', 'js', "/'/;require(\"child_process\").execSync(\"git stash drop\");/'/", true],
  ['q() de perl con comilla (RT2-04)', 'pl', "$x=q(\"); system(\"git stash drop\"); $y=q(\")", true],
];

test('inlineCallsGit: tabla del escáner', () => {
  const bad = [];
  for (const [what, lang, text, deny] of ROWS) {
    const r = inlineCallsGit(text, lang, /launcher\.js/i);
    if (r.deny !== deny) bad.push(`${what}: ${r.deny} (${r.why}), esperado ${deny}`);
  }
  assert.deepStrictEqual(bad, []);
});
