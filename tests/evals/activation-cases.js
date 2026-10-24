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

// Conjunto aparte para la fase 0 del flujo de pantallas (docs/specs/2026-10-24-ui-flujo-design.md, sección 12): ¿se carga `ui`
// con los pedidos naturales de construir una pantalla? Pedidos de una app de finanzas personales, con palabras genéricas:
// sin nombres de una app real ni datos. No toca las 30 frases ya medidas. Sin correr todavía.
// Se elige como el de `plan`: el runner lo selecciona con `--set ui` (UI_CASES) y califica con gradeUi.
const UI = 'pignolo:ui';
const UI_POSITIVE_ES = [
  'hacé la pantalla de resumen del mes: una lista de movimientos y un botón principal para cargar un gasto',
  'armá el dashboard del mes con el total gastado, lo que queda disponible y los últimos movimientos',
  'construí la pantalla de cierre de mes con el resumen de ingresos, gastos y saldo',
  'necesito la pantalla del simulador: un formulario con selector de mes, monto y un botón para calcular',
  'hacé la lista de compromisos del mes con filtros por estado y por categoría',
  'armá la página de configuración con moneda, categorías y preferencias de avisos',
  'construí el panel de navegación lateral de la app, con las secciones principales y la que está activa',
  'agregá una pantalla para ver las cuotas pendientes, con un filtro por mes y un botón para marcar una como pagada',
  'armá el formulario para cargar un ingreso con fecha, monto y categoría',
  'rediseñá la pantalla de resumen mensual: tiene demasiadas cosas y no se entiende cuál es la importante',
];
const UI_POSITIVE_EN = [
  "build the screen that shows this month's overview: a list of transactions and one main button to add an expense",
  'make the settings page for currency, categories and notification preferences',
  'create the month-close summary screen with income, expenses and balance',
  'set up the navigation shell for the app: a sidebar with the main sections and a header',
];
const UI_NEGATIVE = [
  'el endpoint de movimientos devuelve 500 cuando el mes no tiene datos, arreglalo',
  'en el título de la pantalla de resumen dice "Resúmen", corregí la tilde',
  'agregá una migración que sume la columna categoría a la tabla de movimientos',
  'explicame cómo se calcula el saldo disponible del mes en este proyecto',
];
const UI_CASES = [
  ...[...UI_POSITIVE_ES, ...UI_POSITIVE_EN].map((prompt, i) => ({ id: `B${String(i + 1).padStart(2, '0')}`, prompt, expect: UI })),
  ...UI_NEGATIVE.map((prompt, i) => ({ id: `BN${i + 1}`, prompt, expect: null })),
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

// Acierto en el conjunto `ui`: positivas = `pignolo:ui` se invocó (puede ir después de `pignolo:work`, que la línea de work
// manda a ui); negativas = `pignolo:ui` no aparece en ningún lugar.
function gradeUi(expect, invoked) {
  const list = Array.isArray(invoked) ? invoked : (invoked ? [invoked] : []);
  return expect ? list.includes(UI) : !list.includes(UI);
}

module.exports = { EIGHT, CASES, PLAN, PLAN_CASES, UI, UI_CASES, invokedSkill, grade, gradePlan, gradeUi };
