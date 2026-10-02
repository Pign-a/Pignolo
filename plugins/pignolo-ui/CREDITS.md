# Credits

Fuentes de las ideas de pignolo-ui. No se copia código de terceros (los valores de terceros con licencia MIT están en la sección final); los fixtures de terceros, si los hay, solo con licencia MIT o Apache-2.0 y listados acá.

- Formato `DESIGN.md` de Google Labs (`google-labs-code/design.md`, Apache-2.0), versión fijada 0.4.0. pignolo-ui lo lee y lo escribe con código propio; el linter oficial solo corre si ya está instalado.
- WCAG 2.2 (W3C): fórmula de luminancia relativa y de contraste.
- CSS Color Module Level 4 y OKLab (Björn Ottosson): conversiones de color.
- WCAG 2.2 (W3C), criterios de éxito citados en las reglas del catálogo (`catalog/rules.json`, campo `source`).
- WAI-ARIA 1.2 (W3C): roles que no toman su nombre del contenido (A11Y-04).
- RFC 5646 / BCP 47 (IETF): forma de las etiquetas de idioma (A11Y-01).
- CSS Transitions y Media Queries Level 5 (W3C): `transition`, `prefers-reduced-motion` (MOTION-03, MOTION-04).
- Carta `ui-option` (reglas de oficio y datos de muestra), ideas con texto propio y sin copiar nada, todas consultadas el 2026-10-01:
  - impeccable (Paul Bakaus), https://github.com/pbakaus/impeccable, Apache-2.0.
  - Skills de Emil Kowalski, https://github.com/emilkowalski/skills, MIT.
  - Human Interface Guidelines de Apple, https://developer.apple.com/design/human-interface-guidelines/, documentación de Apple (solo enlace; sin licencia de reúso).
- Material Design 3 (Google): nombres semánticos de color; guía para el auditor, con enlace y sin citas textuales.
- Fluent 2 (Microsoft): guía para el auditor, con enlace y sin citas textuales.
- SEO estático (SEO-01, 02, 04, 05, 06, 09, 18), solo enlaces y sin texto copiado, todos consultados el 2026-09-29:
  - RFC 9309, Robots Exclusion Protocol: https://www.rfc-editor.org/rfc/rfc9309
  - RFC 6596, The Canonical Link Relation: https://www.rfc-editor.org/rfc/rfc6596
  - sitemaps.org, protocolo 0.9: https://www.sitemaps.org/protocol.html
  - HTML Living Standard, el elemento `title`: https://html.spec.whatwg.org/multipage/semantics.html#the-title-element
  - The Open Graph protocol: https://ogp.me/
  - Google Search Central, robots meta tag y X-Robots-Tag: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
  - Google Search Central, link best practices (enlaces rastreables): https://developers.google.com/search/docs/crawling-indexing/links-crawlable

## Third-party values (MIT)

The default values that THEME-01 and THEME-02 compare against come from the projects below, with source and version in `catalog/framework-defaults.json` and `catalog/shadcn-base-colors.json`. Only those values are used, not code. Each notice is copied from the project's published LICENSE file.

### shadcn/ui

shadcn-ui/ui, LICENSE.md (commit 08ab84f, shadcn@4.21.0). Values used: base color sets and radius in catalog/shadcn-base-colors.json and catalog/framework-defaults.json.

    MIT License

    Copyright (c) 2023 shadcn

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

### Tailwind CSS

tailwindlabs/tailwindcss, LICENSE (v3.4.17 and v4.3.3, identical text). Values used: blue 500 in catalog/framework-defaults.json.

    MIT License

    Copyright (c) Tailwind Labs, Inc.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.

### Bootstrap

twbs/bootstrap, LICENSE (v5.3.8). Values used: primary and border radius in catalog/framework-defaults.json.

    The MIT License (MIT)

    Copyright (c) 2011-2025 The Bootstrap Authors

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in
    all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
    THE SOFTWARE.

### Vite

vitejs/vite, LICENSE. Notice text taken from the LICENSE of v8.3.1; the values come from v7.0.0. Whether the v7.0.0 LICENSE carries the same text was not verified (no network access when this was written). Value used: the link color of the create-vite React template in catalog/framework-defaults.json.

    MIT License

    Copyright (c) 2019-present, VoidZero Inc. and Vite contributors

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
