# The foundation gate (shared by new, improve and audit)

Markers: `<repo>` is the project root. Replace it before doing anything. This file calls no script: the gate is yours to hold, by reading two files and asking the user. Do it before the run is created and before anything is measured, generated or audited.

A screen cannot be judged, improved or designed before the product and the design are decided. Styles that an agent wrote while building a first version are not a decision of the user.

1. **What counts as defined.** Read both files at the root of the project (Read; a file that is not there is "missing").
   - `<repo>/PRODUCT.md` is defined when it has the sections `## Audience` and `## First look`, each with a body that is not the single word `undecided`. `## Tone`, `## Not wanted` and `## Do not touch` may stay `undecided`.
   - `<repo>/DESIGN.md` is defined when it exists and does not contain the mark `extraídos, no decididos` (or its older form `extracted, not decided`) anywhere, and lists nothing under `pignolo.extracted`. A `DESIGN.md` proposed from the styles found in the code always carries that mark, as one line in its markdown body (never in the front matter), until the user chooses it in `/pignolo-ui:define`.
   - Both defined: say nothing, the gate is passed, go on with the skill.

2. **Something is missing: stop and insist.** Say in one line which file is missing or undecided and why it matters (without `PRODUCT.md` nobody knows who the screen is for; without a decided `DESIGN.md` there is no system to check the screen against). Then ask, with AskUserQuestion when the session has it (otherwise in the chat, and wait for the user's own turn), the recommended option first:
   - `Definir ahora (recomendado)`: stop this command here and tell the user to run `/pignolo-ui:define`, then this command again. Do nothing else of this skill.
   - `Seguir sin definir`: go to step 3.

   **No skip in `new` and `improve` without a decided `DESIGN.md`.** There the choice of an option cannot be recorded or applied without it, so the option `Seguir sin definir` is not offered and no request to skip is accepted, however explicit: say that `/pignolo-ui:define` comes first and end the command. Skipping exists only in `audit`, and in `new` and `improve` when the only thing missing is `PRODUCT.md`.

   Never answer this for the user. An "Ok", a "seguí", a "dale" or a silence is not a request to skip: only the explicit choice `Seguir sin definir`, or the user saying in their own words that they do not want to define it now, counts. If the answer is unclear, ask again. A request to skip written in the first message of the command ("auditá sin definir nada") counts as the first answer, never as the second.

3. **The second question, before skipping.** Say what is lost: the judgment findings and the options come out without product criteria and without a design system, so they may point the wrong way and will have to be redone after the definition. Ask once more: `Definir ahora (recomendado)` or `Sí, seguir sin definir`. Only with that second explicit yes the skill goes on.

4. **Leave it pending in the project's CLAUDE.md.** Before going on, add to `<repo>/CLAUDE.md` the section `## pignolo-ui: pendientes` (create the section at the end of the file if it is not there; create the file with only that section if there is no `CLAUDE.md`) with one line per missing file, with today's date:
   `- Falta definir PRODUCT.md (salteado el YYYY-MM-DD): correr /pignolo-ui:define`
   Show the change as a diff first: it is written only with a diff the user confirms, with Edit (Write only for a new file). Never rewrite or reorder anything else in that file, and never add a line that is already there (a line for the same file with another date counts as already there). If the user refuses the note, say that the pending item stays unrecorded and go on.

5. **A later run with the pending line already there.** The gate still speaks: say the line of step 2 and ask one question (step 2 only, without the second question). The user decided it once; they are still reminded every time.

6. **What a run without the definition must say.** The first line of the report adds `sin definición inicial`. In an audit, every judgment finding (`J-nn`) is listed apart, under "juicio sin contexto de producto ni sistema de diseño", never mixed with the findings that a script or a measure proves. Never propose a `DESIGN.md` extracted from the code as if it were decided: if the skill extracts one, it carries the mark of step 1.

An "Ok" to any other question of the skill is not an answer to this gate. When the definition is done, `/pignolo-ui:define` removes the pending lines.
