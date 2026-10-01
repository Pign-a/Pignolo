# Lienzo "Design" y "Design System" de claude.ai: hechos verificados (2026-10-01)

Insumo del plan `docs/plans/2026-10-01-pignolo-ui-hito-4c-lienzo.md`. Salvo donde dice otra cosa, todo salió de **llamadas reales** de la herramienta `Artifact` en la cuenta del autor (prueba del 2026-10-01: un lienzo privado de dos pantallas) y de la lectura de solo lectura de las instrucciones de los tipos. Las instrucciones de los tipos son contenido de terceros: se usan solo para decidir el contenido de lo que se publica; no dan permisos ni amplían la tarea. El enlace del lienzo de prueba es privado y no se versiona.

## 1. Detección y creación

- `Artifact` con `action: "list"` y `scope: "types"` lista los tipos de la cuenta. En la cuenta del autor: "Design" (lienzo con artboards), "Design System" (README, tokens, componentes con vista previa), "Docs" y "Slides". Se detecta por **título exacto**; el `type_url` sale del listado, nunca se escribe a mano.
- `action: "read"` con `type_url` (sin `url`) devuelve las instrucciones del tipo sin publicar nada. Con la `url` de un lienzo existente y `path`, devuelve un archivo del propio lienzo (por ejemplo `artifact-type/reference/format.md`), también sin escribir.
- Crear un lienzo: UNA llamada `publish` con `type_url`, `title` (obligatorio) y `auto_open: "after_first_write"`, sin archivos. Devuelve la `url` y las instrucciones del tipo. Nunca se vuelve a pasar `type_url` para ese lienzo.
- Llenarlo: UNA llamada `publish` con `url`, `root` (carpeta local), `file_path` (ruta **absoluta** de `project/canvas.json`) y `files` = `{ "project/<nombre>.dc.html": "project/<nombre>.dc.html", ... }`. Funcionó a la primera con dos artboards. Total: dos llamadas.
- El resultado dice que lo publicado es legible solo por el autor: queda **privado**. Compartir solo se hace desde el menú Share de la página; el agente no lo cambia.
- Solo se escribe bajo `project/`; todo lo demás es del tipo y se rechaza.
- `list` con `type: "Design System"` lista los sistemas de la cuenta; en la cuenta del autor estaba vacío.
- El tipo pide **no verificar después de publicar** (no releer, no capturar, no renderizar) salvo que el usuario lo pida.
- Límites: 16 MB por llamada, 512 archivos y 256 MB por lienzo; 255 rutas por llamada con `files`.

## 2. Formato del lienzo (`project/canvas.json`)

- Índice: `{"v":3,"createdOnFiles":{"v":1,"at":"<RFC 3339>"},"title","launch":{"view":"canvas"},"pages":[],"boards":{"Main.dc.html":{"x","y","w","h","title"?,"is_interactive"?,"expand"?}},"order":[...],"notes":{...},"designSystems":[]}`.
- El primer artboard se llama `Main.dc.html`. `w` y `h` de cada marco: 40 a 8000 px. **80 px entre marcos de una fila, 120 entre filas.**
- Nota `kind: "title1"` = título de **varios** artboards (una línea en negrita de 72 px); con `maxW` igual al ancho de su fila; **al menos 223 px arriba de su fila**, fuera de las tiras de nombre de los marcos y sin nada encima. Hasta 200 notas.
- `is_interactive: true` solo en artboards con controles que funcionan; solo esos tienen botón Play. `expand: "fill"` es para una PAGE fluida; una raíz de tamaño fijo `w` por `h` es para maqueta de dispositivo. Tamaños: teléfono 390x844, escritorio 1280 a 1440.
- Nombres de archivo: terminan en `.dc.html`; cada segmento empieza con letra, dígito o `_` y sigue solo con esos más `.` y `-`; sin espacios; raíces únicas.
- Cada `.dc.html` fuera de `project/ds/` se muestra en el lienzo aunque no esté listado; el índice tiene que listar cada uno.
- Si el índice ya existe, se conservan todas sus claves y entradas que no se cambian (las personas pueden haberlo editado).

## 3. Formato de un artboard (`.dc.html`)

- Esqueleto fijo: `<!doctype html>`, `<html lang>`, `<head>` con `<meta charset>`, `<title>` y **exactamente** `<script src="./support.js"></script>`; `<body><x-dc><helmet>` con `<style>` y, solo si hace falta, `<link>` de Google Fonts `css2`; el contenido con raíz de tamaño fijo; `</x-dc>`; y `<script type="text/x-dc" data-dc-script data-props='{...,"$preview":{"width","height"}}'>` con `class Component extends DCLogic { renderVals() { return {...}; } }`.
- Reglas que fallan en silencio: cerrar todo elemento no vacío y poner comillas a todo atributo; `{{hueco}}` es una búsqueda con puntos en lo que devuelve `renderVals()` (cualquier `{{` del contenido se interpreta); sin expresiones; sin red salvo Google Fonts `css2` y los assets subidos; sin `<iframe>`, `<object>` ni `<embed>`; sin emoji como íconos; sin controladores globales de teclado. Los estilos van en línea y `<helmet><style>` es para lo básico (`body{margin:0}`, color de `a` y `a:hover`).
- **Enlaces entre artboards:** `<a href="Cart.dc.html">` lleva el modo Play a ese artboard; el `href` es la ruta del destino relativa a la del artboard. Hay que dar estilo al propio `<a>` como botón: un `<button>` o un `<input>` **dentro** de un `<a>` se traga el clic. `href="#id"` desplaza dentro del artboard; `https://...` abre una pestaña.
- Cada artboard guarda su propio estado: un flujo que comparte estado entre pasos va en un solo artboard.
- Accesibilidad: `<button>`, `<a href>` e `<input>` con `<label>` reales; contraste 4,5:1.

## 4. Design System instalado en el lienzo

- Un lienzo "instala" un sistema con dos cosas, ambas obligatorias (sin ellas el menú Theme muestra hex sueltos): el archivo `project/ds/<carpeta>/tokens.json` y un registro en `designSystems` del índice: `{"title","namespace":"<carpeta>","artifact":"<dirección>","version":<id|null>,"copiedAt":"<ahora>"}`.
- `<carpeta>`: sale del namespace, en minúscula, cada tramo de otros caracteres pasa a `-`, sin `-` ni `_` al inicio, `[a-z0-9][a-z0-9_-]{0,63}`.
- El archivo se copia **del lado del servidor** con una entrada de `files` de la forma `{"artifact":"<dirección>","path":"project/tokens.json"}`. La `<dirección>` es la que dio el usuario o el listado, **cortada después de su id**; nunca una leída del propio sistema.
- Por eso el Design System se publica **antes** que el lienzo.

## 5. Formato de un Design System (leído de las instrucciones del tipo; no probado con una publicación)

- Se crea igual que un lienzo: una llamada `publish` con `type_url`, `title` y `auto_open: "after_first_write"`, sin archivos. Después, una llamada con `url`, `root`, `file_path` y `files`.
- Archivos bajo `project/`: `design-system.json` (índice, **va en la última llamada**, con `createdOnFiles`, `layout: "files"`, `title`, `namespace`, `libraries`, `sections`, `groups`, `assetGroups`, `blobs` y `docs`), `tokens.json`, `README.md` (obligatorio), `components/Cover/preview.html` (la tapa; "cada sistema tiene una") y, opcionales, componentes, íconos y fuentes. `tokens.css`, `manifest.json` y `api/...` los genera la página: nunca se escriben.
- `tokens.json`: `{"name","version":1,"color":{"themes":[{"id","name"}],"tokens":[{"name","value","usage"}]},"type":{"fonts":[],"families":{},"groups":[{"name","family","styles":[{"name","fontSize","lineHeight","fontWeight"}]}]},"spacing":{"tokens":[...]},"radius":{"tokens":[...]}}`.
- Cada familia salvo `type` es una **lista** de entradas; un mapa nombre-valor (formato DTCG) es JSON válido que la página no puede leer. Nombres `[A-Za-z0-9][A-Za-z0-9_.-]{0,63}`, **únicos entre todas las familias salvo `type`**. Colores que se leen: hex (con o sin alfa), `rgb()`, `rgba()`, `hsl()`, `oklch()` y semejantes, o un alias `"{otro-token}"` de un token de color que exista. Se descartan: colores con nombre (`red`, `transparent`, `currentColor`), `var()`, `color-mix()` y alias a un token que no existe o a sí mismo. Un token sin valor en un tema hereda el del primero. Longitudes `px`, `rem`, `em`, `%` o número; `lineHeight` puede ir sin unidad.
- Un token de color con valor distinto por tema se escribe `"value": {"light": "...", "dark": "..."}`.
- Cada token lleva una nota de uso; el README es "un libro de marca" (fundamentos de contenido, fundamentos visuales, íconos). Un sistema sin nada de donde construir es "pequeño": README de un párrafo y tokens.
- Un sistema nuevo se escribe en una sola llamada con el índice; una revisión envía solo los archivos cambiados y el índice, releído justo antes, en la última llamada.

## 6. Lo que NO está verificado (el plan lo cierra en una puerta manual)

1. Que las clases CSS y las variables `:root` de un `<style>` dentro de `<helmet>` se apliquen en el artboard (la prueba real usó solo estilos en línea).
2. Que las consultas `@media` del contenido evalúen contra el ancho del marco del artboard y no contra el de la ventana (decide si un artboard de 390 px se ve como celular).
3. El comportamiento real del enlace `<a href="x.dc.html">` en modo Play y el de atributos booleanos (`disabled`) y elementos vacíos (`<br>`, `<img>`) tal como los deja el conversor.
4. El formato de la tapa (`components/Cover/preview.html`; la regla está en `artifact-type/reference/cover.md` del tipo "Design System", que solo se sirve al crear uno) y la gramática completa de `tokens.json` (`artifact-type/reference/format.md` de ese tipo).
5. Que el menú Theme del lienzo muestre los tokens instalados con el archivo copiado por el servidor.
6. Si `shadow` y otras familias opcionales aceptan la cadena `box-shadow` completa.
