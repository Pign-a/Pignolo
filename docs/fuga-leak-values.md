# Fuga de `leak-values.json` al historial de git: qué hacer

Guía corta para quien usó pignolo-ui antes de la 0.11.0. Los comandos los corre la persona, no el agente.

## 1. Qué pasó

Antes de pignolo-ui 0.11.0, `leak-values.json` y `leak-origins.json` se guardaban en `.pignolo-ui/runs/<corrida>/`. Adentro hay en texto plano el usuario del sistema, la carpeta personal y el nombre y el email de git (y, si se pasó `--email`, el de la cuenta). La carpeta `.pignolo-ui/` se ignora entera a propósito, pero un `git add -f` (por ejemplo para un "commit de resguardo") la puede meter al historial. No son claves ni contraseñas, pero son datos personales.

Desde la 0.11.0 esos archivos viven fuera del proyecto, en `<PIGNOLO_HOME>/ui-leaks/<repo>/<corrida>/` (`~/.pignolo` por omisión).

## 2. Commit local, sin push

Ver qué commits los traen:

```
git log --stat --oneline -- .pignolo-ui
```

- **Es el último commit:** `git reset --soft HEAD~1`, después `git restore --staged -- .pignolo-ui` y volver a commitear lo que corresponda.
- **Hay commits encima:** en tu terminal, `git rebase -i <commit anterior al primero>`; marcá `edit` en cada commit que los trae; en cada parada `git rm --cached -r .pignolo-ui`, `git commit --amend --no-edit` y `git rebase --continue`.
- **Verificar:** `git log --stat -- .pignolo-ui` no debe mostrar nada.
- **Los objetos viejos** siguen en el reflog. Para borrarlos de verdad: `git reflog expire --expire=now --all && git gc --prune=now`. Lo corrés vos: la guardia de pignolo se lo niega a los agentes a propósito.
- **Los archivos del árbol:** `node <carpeta de pignolo-ui>/scripts/run.mjs leak-migrate --project . --delete`. Sin `--delete` solo lista las rutas (nunca el contenido). No toca el índice ni el historial.

## 3. Ya se publicó (push)

Tratalo como publicado.

- Repo privado de una sola persona: el riesgo es bajo, pero cambiar de commit no lo quita de las copias que ya existan.
- Repo público o compartido: reescribí la historia con `git filter-repo --path .pignolo-ui --invert-paths`, hacé el `git push --force` a mano (es decisión tuya; la guardia lo niega a los agentes), avisá a quienes clonaron, pedile al alojamiento que purgue las vistas en caché (en GitHub, por soporte) y tené presente que el email ya figura en los metadatos de los commits.

## 4. Cómo no vuelve a pasar

Actualizá ambos plugins (`/plugin update`). Cada capa hace una cosa:

- **pignolo-ui 0.11.0:** los valores se escriben fuera del proyecto y `leak-values` avisa que no se agreguen a git. Esta capa no depende del núcleo.
- **Núcleo 0.21.0, guardia:** un subagente no puede hacer `git add -f` ni `git update-index --add`; un `git commit` cuyo contenido incluye archivos privados de pignolo (`.pignolo-ui/`, `.pignolo/local/`, `leak-values.json`...) se frena, también con `/pignolo:off`; sacar del índice y leer nunca se frenan.
- **Textos:** las skills y los mensajes de la guardia ya no sugieren "commitear todo" para resguardar trabajo.
