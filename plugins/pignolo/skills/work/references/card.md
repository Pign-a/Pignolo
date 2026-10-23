# Plan card

A card is the whole plan for a feature, short enough to read in a minute. It exists so the author can correct the scope before code exists, and so the final review has something to compare against. Write it in the author's language (Spanish), keep it under about 25 lines, and fill every field; "none" is a valid answer and tells the reader you looked.

- **Archivos:** the files to create or change, one per line, each with a few words on what changes. Naming them forces you to find the real touch points and shows the author the blast radius.
- **Interfaces:** the signatures, data shapes, routes or commands other code depends on, written literally. If these are wrong, everything built on top is wrong, so they are worth stating before building.
- **Casos de prueba:** the concrete cases, with the literal input and the expected output. Include at least one edge case and one failure case. If no executable test fits, write the manual check instead, with the exact command or page to look at.
- **Criterio de hecho:** the observable statement that makes the feature finished, such as a command that exits 0 or a screen that shows a given thing. The executor and the reviewer both use it to stop, so it must be checkable, not a feeling.

If the work touches the fixed floor (migrations, authentication, secrets, data deletion), add a line saying what could be lost or exposed and how it is undone.
