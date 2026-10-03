// Pestaña UI: ¿está pignolo-ui? (D-U5). Puro: register.js pasa los lectores (funciones que cierran sobre `$`). En este orden,
// la primera señal que se pueda leer gana; cada una va en try/catch y un fallo pasa a la siguiente.
//   1) settings: alguna clave de `enabledPlugins` que empiece con `pignolo-ui@`. Si se lee bien y no está en true, NO está.
//   2) los comandos registrados: alguno cuyo nombre empiece con `pignolo-ui`.
//   3) la carpeta `.pignolo-ui/` o un PRODUCT.md / DESIGN.md en el proyecto.
// detectUi({ readSettings, listCommands, hasFolder }) -> { installed, via: 'settings'|'commands'|'folder'|'none' }

export async function detectUi({ readSettings, listCommands, hasFolder }) {
  try {
    const s = await readSettings()
    const plugins = s && typeof s === 'object' ? s.enabledPlugins : null
    if (plugins && typeof plugins === 'object' && !Array.isArray(plugins)) {
      const on = Object.entries(plugins).some(([name, value]) => typeof name === 'string' && name.startsWith('pignolo-ui@') && value === true)
      return { installed: on, via: on ? 'settings' : 'none' }
    }
  } catch {
    // sin lectura de settings: sigue con los comandos
  }
  try {
    const list = await listCommands()
    if (Array.isArray(list) && list.some((c) => c && typeof c.name === 'string' && /^pignolo-ui(:|$)/.test(c.name))) return { installed: true, via: 'commands' }
  } catch {
    // sin lista de comandos: sigue con la carpeta
  }
  try {
    if (await hasFolder()) return { installed: true, via: 'folder' }
  } catch {
    // sin lectura de la carpeta
  }
  return { installed: false, via: 'none' }
}
