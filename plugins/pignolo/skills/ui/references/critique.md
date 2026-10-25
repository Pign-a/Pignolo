# Critique

After generating a screen or a piece, review it once against these seven yes/no items and fix only the ones that fail. A fixed list is what catches the usual first-version problems; touching only the failures matters because reworking what already passes tends to make it worse.

Look at a screenshot when a browser tool exists (open the page and capture it). If there is none, read the code and say so in the reply.

1. **Purpose.** Each panel and region says what it is for (a header or label), and matches the brief if there is one. Prevents panels nobody can explain.
2. **One primary action.** Exactly one primary-styled action per view, and it is the most prominent element. Prevents a view with no hierarchy of actions.
3. **Text hierarchy.** With the detail blurred, title, section, body and caption read in that order, with at most 4 text roles per region. Prevents flat text where everything weighs the same.
4. **Scope.** Nothing on screen is outside the job and the key data (the brief's, if there is one) without a reason. Prevents the overloaded screen.
5. **Space.** Whitespace separates regions and proximity groups related items, at the density the identity sets. Prevents a crowded or scattered layout.
6. **Meaning.** Each headline figure says what it measures and whether more or less is good, in words or a mark and not by color alone; the second most important function is visible without scrolling. Prevents a big number nobody can interpret and a key feature buried below a table.
7. **Narrow screens.** At 390 px wide the reading order holds and targets are at least 44 px. Prevents a layout that only works on a desktop.

Report one line, `Critique: N yes, M no`, and for each "no" one line with the element and the fix. Then fix those and nothing else: no second pass, no "improving" what passed. Contrast, hover and focus states and native widgets are measured, not judged: they belong to `/pignolo:ui-audit`, when the author asks for it.
