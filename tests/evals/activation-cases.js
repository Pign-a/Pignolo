'use strict';
// Frases de la prueba de activación (tests/evals/RESULTS-activacion.md). Sin correr todavía.
// `expect` es la skill que debería invocarse; null = ninguna de las ocho.
const EIGHT = [
  'pignolo-ui:new', 'pignolo-ui:improve', 'pignolo-ui:audit', 'pignolo-ui:define',
  'pignolo:status', 'pignolo:close-session', 'pignolo:init', 'pignolo:setup',
];

const POSITIVE = [
  ['quiero que hagamos ahora el panel de datos de la app', 'pignolo-ui:new'],
  ['armá la pantalla de login con mail y contraseña', 'pignolo-ui:new'],
  ['necesito una página de precios con tres planes', 'pignolo-ui:new'],
  ['design a new settings screen for the account', 'pignolo-ui:new'],
  ['hagamos el flujo de alta de clientes, tres pantallas', 'pignolo-ui:new'],
  ['mejorá la pantalla de inicio, no me convence cómo se ve', 'pignolo-ui:improve'],
  ['el dashboard se ve mal, rehacelo', 'pignolo-ui:improve'],
  ['improve the pricing page, it feels cluttered', 'pignolo-ui:improve'],
  ['esta vista de listado está fea, hacela más clara', 'pignolo-ui:improve'],
  ['auditá la pantalla de login', 'pignolo-ui:audit'],
  ['revisá si la página de checkout cumple con el diseño', 'pignolo-ui:audit'],
  ['check the accessibility of the dashboard page', 'pignolo-ui:audit'],
  ['definamos el producto y el diseño de la app antes de armar pantallas', 'pignolo-ui:define'],
  ['quiero definir los colores y la tipografía de este proyecto', 'pignolo-ui:define'],
  ['set up the design system for this web app', 'pignolo-ui:define'],
  ['¿está prendido pignolo en este proyecto?', 'pignolo:status'],
  ['cerremos la sesión y dejá registro de lo que hicimos', 'pignolo:close-session'],
  ['terminamos por hoy, guardá el estado del proyecto', 'pignolo:close-session'],
  ['quiero usar pignolo en este repo, activalo', 'pignolo:init'],
  ['cambiá el perfil de pignolo a economy', 'pignolo:setup'],
];

const NEGATIVE = [
  'cambiá el color del botón de guardar a azul',
  'el texto del título dice "Bienvenido", ponele "Hola"',
  'la función parseFecha devuelve undefined con fechas vacías, arreglala',
  'explicame cómo funciona el middleware de autenticación',
  'agregá un test para calcularTotal',
  'renombrá la variable tmp a resultado en utils.js',
  'qué hace el flag --force de git push',
  'subí la versión del paquete a 1.2.0',
  'el padding del header en mobile está en 8px, pasalo a 12px',
  'revisá este diff y decime si hay bugs',
];

const CASES = [
  ...POSITIVE.map(([prompt, expect], i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, prompt, expect })),
  ...NEGATIVE.map((prompt, i) => ({ id: `N${String(i + 1).padStart(2, '0')}`, prompt, expect: null })),
];

// Qué skill invocó la corrida: el primer tool_use `Skill` del stream-json de `claude -p`.
function invokedSkill(streamText) {
  for (const line of streamText.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch (_) { continue; }
    if (ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) continue;
    for (const part of ev.message.content) {
      if (part.type === 'tool_use' && part.name === 'Skill' && part.input && part.input.skill) return String(part.input.skill);
    }
  }
  return null;
}

// Acierto: la invocada es la esperada; en los negativos, ninguna de las ocho.
function grade(expect, invoked) {
  if (expect) return invoked === expect;
  return invoked === null || !EIGHT.includes(invoked);
}

module.exports = { EIGHT, CASES, invokedSkill, grade };
