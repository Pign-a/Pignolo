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

// Conjunto aparte para el carril `plan` (plan 2026-10-03-salir-del-flujo, T4): no toca las 30 frases ya medidas.
const PLAN = 'pignolo:plan';
const PLAN_POSITIVE = [
  'armá un plan para el cambio grande del prototipo',
  'armá un plan',
  'hacé un plan de cómo migramos el login a otro proveedor',
  'planificá la nueva pantalla de reportes antes de tocar nada',
  'necesito un plan detallado para reescribir el módulo de facturación',
  'escribí el plan y la especificación del buscador',
  'make a plan for the checkout redesign',
  "write up a plan to split the monolith, don't implement anything yet",
  'plan this feature before we start: export to CSV',
  'armemos el plan del cambio y después lo ejecutamos',
];
const PLAN_NEGATIVE = [
  'qué dice el plan del hito 3 sobre los permisos?',
  'resumime el plan que está en docs/plans',
  'cambiá el nombre del plan "Básico" a "Starter" en la página de precios',
  'el cálculo del plan mensual da mal en febrero, arreglalo',
];
const PLAN_CASES = [
  ...PLAN_POSITIVE.map((prompt, i) => ({ id: `Q${String(i + 1).padStart(2, '0')}`, prompt, expect: PLAN })),
  ...PLAN_NEGATIVE.map((prompt, i) => ({ id: `QN${i + 1}`, prompt, expect: null })),
];

const CASES = [
  ...POSITIVE.map(([prompt, expect], i) => ({ id: `P${String(i + 1).padStart(2, '0')}`, prompt, expect })),
  ...NEGATIVE.map((prompt, i) => ({ id: `N${String(i + 1).padStart(2, '0')}`, prompt, expect: null })),
];

// Qué skills invocó la corrida: todos los tool_use `Skill` del stream-json de `claude -p`, en orden.
function invokedSkill(streamText) {
  const out = [];
  for (const line of streamText.split('\n')) {
    if (!line.trim().startsWith('{')) continue;
    let ev;
    try { ev = JSON.parse(line); } catch (_) { continue; }
    if (ev.type !== 'assistant' || !ev.message || !Array.isArray(ev.message.content)) continue;
    for (const part of ev.message.content) {
      if (part.type === 'tool_use' && part.name === 'Skill' && part.input && part.input.skill) out.push(String(part.input.skill));
    }
  }
  return out;
}

// Con pignolo activo, `pignolo:entry` va primero y manda la UI a pignolo-ui: ese camino es correcto.
const ENTRY = 'pignolo:entry';

// Acierto en una positiva: la esperada se invocó y antes de ella solo hubo `pignolo:entry`.
// En una negativa: ninguna de las ocho en toda la lista (entry no cuenta).
function grade(expect, invoked) {
  const list = Array.isArray(invoked) ? invoked : (invoked ? [invoked] : []);
  if (expect) {
    const i = list.indexOf(expect);
    return i >= 0 && list.slice(0, i).every((s) => s === ENTRY);
  }
  return !list.some((s) => EIGHT.includes(s));
}

// Acierto en el conjunto `plan`: positivas = grade(PLAN, ...); negativas = `pignolo:plan` no aparece en ningún lugar.
function gradePlan(expect, invoked) {
  const list = Array.isArray(invoked) ? invoked : (invoked ? [invoked] : []);
  return expect ? grade(PLAN, list) : !list.includes(PLAN);
}

module.exports = { EIGHT, CASES, PLAN, PLAN_CASES, invokedSkill, grade, gradePlan };
