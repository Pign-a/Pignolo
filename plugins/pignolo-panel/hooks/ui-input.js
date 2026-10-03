// Pestaña UI: lee lo que hay de pignolo-ui en el proyecto y arma un resumen COMPACTO y SIN contenido (D-U1, D-U2).
// Nada acá toca `$`: register.js pasa un lector `{ exists, list, read }` con funciones que cierran sobre `$.fs` (el motor no
// deja pasar `$` a otro archivo). Nunca tira: lo que no se puede leer se cuenta como ausente.
//
// Lo que sale: nombres fijos de secciones sin decidir de PRODUCT.md, si DESIGN.md existe y está decidido, nombres de pantallas
// (pasados por safeName), comando y fecha de las últimas corridas y, de auditor.json, el conteo por severidad y hasta 5 ids de
// regla. Jamás texto de un archivo del usuario.

export const PRODUCT_SECTIONS = ['Audience', 'First look', 'Tone', 'Not wanted', 'Do not touch']
export const MAX_SCREENS = 12
export const MAX_RECENT = 5
export const MAX_IDS = 5
export const READ_MAX = 64 * 1024
const MAX_RUNS_SCANNED = 30
const SEVERITIES = ['bloquea', 'alto', 'medio', 'detalle']
const COMMANDS = ['new', 'improve', 'audit']
const RUN = /^(\d{4}-\d{2}-\d{2})-\d{4}-(new|improve|audit)-([a-z0-9][a-z0-9-]*)$/
const RULE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,23}$/
const HEADING = /^##\s+(.*?)\s*#*\s*$/

// Nombre seguro: solo [a-z0-9._-], hasta `max` caracteres; sin puntos, guiones ni guiones bajos al comienzo.
export function safeName(s, max = 40) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, max)
}

async function attempt(fn, fallback) {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

// Entradas de una carpeta, sin enlaces (symlink o junction): un enlace puede apuntar fuera del proyecto.
async function entries(fsx, dir) {
  const list = await attempt(() => fsx.list(dir), [])
  return Array.isArray(list) ? list.filter((e) => e && typeof e.name === 'string' && e.isLink !== true) : []
}

async function readText(fsx, path) {
  const raw = await attempt(() => fsx.read(path), '')
  let s = typeof raw === 'string' ? raw : ''
  if (s.length > READ_MAX) s = s.slice(0, READ_MAX)
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

const find = (list, kind, re) => list.find((e) => e.kind === kind && re.test(e.name))
const dirNamed = (list, name) => list.find((e) => e.kind === 'dir' && e.name === name)

// PRODUCT.md: solo los nombres de las secciones conocidas cuyo cuerpo es la palabra `undecided` o que faltan. Nunca el texto.
function undecidedSections(text) {
  const bodies = {}
  let current = null
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const m = HEADING.exec(line)
    if (m) {
      current = PRODUCT_SECTIONS.find((s) => s.toLowerCase() === m[1].trim().toLowerCase()) || null
      if (current && bodies[current] === undefined) bodies[current] = []
      continue
    }
    if (line.startsWith('# ')) {
      current = null
      continue
    }
    if (current) bodies[current].push(line)
  }
  return PRODUCT_SECTIONS.filter((s) => bodies[s] === undefined || bodies[s].join('\n').trim().toLowerCase() === 'undecided')
}

// auditor.json -> { bloquea, alto, medio, detalle, ids }. Solo severidades conocidas e ids con forma de id de regla.
function auditSummary(text) {
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const findings = json && Array.isArray(json.findings) ? json.findings : null
  if (!findings) return null
  const out = { bloquea: 0, alto: 0, medio: 0, detalle: 0, ids: [] }
  const byRank = []
  for (const f of findings) {
    if (!f || typeof f !== 'object' || !SEVERITIES.includes(f.severity)) continue
    out[f.severity] += 1
    if (typeof f.id === 'string' && RULE_ID.test(f.id) && !byRank.some((x) => x.id === f.id)) byRank.push({ id: f.id, rank: SEVERITIES.indexOf(f.severity) })
  }
  out.ids = byRank.slice(0, MAX_IDS).map((x) => x.id)
  return out
}

const empty = () => ({
  product: { exists: false, undecided: [] },
  design: { exists: false, decided: false },
  screens: [],
  recent: [],
})

// readUiInput(fsx, root) -> { present, input }. `present`: se pudo leer la carpeta del proyecto.
export async function readUiInput(fsx, root) {
  const input = empty()
  try {
    const top = await entries(fsx, root)
    if (top.length === 0) return { present: false, input }
    const prod = find(top, 'file', /^product\.md$/i)
    if (prod) {
      input.product = { exists: true, undecided: undecidedSections(await readText(fsx, `${root}/${prod.name}`)) }
    }
    const des = find(top, 'file', /^design\.md$/i)
    if (des) input.design = { exists: true, decided: (await readText(fsx, `${root}/${des.name}`)).trim().length > 0 }

    const screens = new Map()
    // 1) pantallas aprobadas: design/approved/<flujo>/<pantalla>.html
    const design = dirNamed(top, 'design')
    const approved = design ? dirNamed(await entries(fsx, `${root}/design`), 'approved') : null
    if (approved) {
      const flows = (await entries(fsx, `${root}/design/approved`)).filter((e) => e.kind === 'dir').sort((a, b) => (a.name < b.name ? -1 : 1))
      for (const flow of flows) {
        const flowName = safeName(flow.name)
        if (!flowName) continue
        for (const f of await entries(fsx, `${root}/design/approved/${flow.name}`)) {
          const m = f.kind === 'file' ? /^(.+)\.html$/i.exec(f.name) : null
          const name = m ? (/^index$/i.test(m[1]) ? flowName : safeName(m[1])) : ''
          if (name && !screens.has(name)) screens.set(name, { name, flow: flowName })
        }
      }
    }
    // 2) corridas: .pignolo-ui/runs/<fecha>-<hora>-<comando>-<slug>
    const runsList = []
    const pui = dirNamed(top, '.pignolo-ui')
    const runsDir = pui ? dirNamed(await entries(fsx, `${root}/.pignolo-ui`), 'runs') : null
    if (runsDir) {
      for (const e of await entries(fsx, `${root}/.pignolo-ui/runs`)) {
        const m = e.kind === 'dir' ? RUN.exec(e.name) : null
        if (m) runsList.push({ dir: e.name, date: m[1], command: m[2], screen: safeName(m[3]) })
      }
      runsList.sort((a, b) => (a.dir < b.dir ? 1 : -1))
    }
    const scanned = runsList.slice(0, MAX_RUNS_SCANNED)
    for (const r of scanned) {
      if (!r.screen) continue
      const s = screens.get(r.screen) || { name: r.screen }
      if (!s.lastRun) s.lastRun = { command: r.command, date: r.date }
      if (!s.audit && r.command === 'audit') {
        const a = auditSummary(await readText(fsx, `${root}/.pignolo-ui/runs/${r.dir}/auditor.json`))
        if (a) s.audit = a
      }
      screens.set(r.screen, s)
    }
    input.screens = [...screens.values()]
      .sort((a, b) => {
        const da = a.lastRun ? a.lastRun.date : ''
        const db = b.lastRun ? b.lastRun.date : ''
        return da === db ? (a.name < b.name ? -1 : 1) : da < db ? 1 : -1
      })
      .slice(0, MAX_SCREENS)
    input.recent = scanned
      .filter((r) => r.screen && COMMANDS.includes(r.command))
      .slice(0, MAX_RECENT)
      .map((r) => ({ command: r.command, screen: r.screen, date: r.date }))
    return { present: true, input }
  } catch {
    return { present: false, input: empty() }
  }
}

// Serialización estable: claves ordenadas.
export function stableString(v) {
  if (Array.isArray(v)) return '[' + v.map(stableString).join(',') + ']'
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableString(v[k])).join(',') + '}'
  return JSON.stringify(v === undefined ? null : v)
}

export async function hashInput(input) {
  const bytes = new TextEncoder().encode(stableString(input))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const knownScreen = (input, name) => input.screens.some((s) => s.name === name)
