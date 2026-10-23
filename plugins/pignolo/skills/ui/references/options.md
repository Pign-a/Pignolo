# Options for big pieces

Three options exist so the author compares real alternatives instead of approving the first idea. They cost three generations, so they are reserved for decisions that are expensive to reverse: the identity, full screens, and big pieces (navigation, modal, sidebar, data table with sample data). A button or a title never gets options.

## Generate them

One `ui-option` agent per option, launched together because they are independent. Pass `model` and `effort` explicitly (default `sonnet` and `medium`; use `opus` for the identity round if the author asks for maximum quality).

Each brief carries:

- The piece, what it is for and who uses it, from the conversation and `roadmap.md`.
- The axis that option must vary along. Give each agent a different axis (density, structure, emphasis, mood). Options that differ only in color are a failed round.
- The folder to write into, empty, and the file names: `design/options/<piece>/a.html`, `b.html`, `c.html` (for a full screen with several states, name each file in the list).
- The parts of `design.md` and the catalog that apply, quoted: the agent cannot read the repository. For the identity round, the author's references and taste instead.
- The data it may use literally. Everything else is filled with realistic sample values marked `data-sample`, and the page shows `Datos de muestra`.
- That it is a style tile (identity) or a screen/piece, and that fonts are local only.

The agent replies with one line, `done: <files>`.

## Read what came back

Open the files (or at least check they exist, link to each other and are well formed) before showing them. If one is a recolored copy of another, regenerate it with a stronger axis. Do not tell the author an option exists that you did not check.

## Present and decide

1. Add the piece to the data in `design/index.html` as `pendiente`, with its three paths, and give the author the path to open.
2. The author compares and picks, or asks for a mix: generate one more round from the mix instead of editing by hand.
3. When chosen: set the piece to `decidido`, write the choice into `design.md` (what was decided and why, in a few lines), and move what the chosen option defines into the catalog or the screen.

Options are not deleted when decided; they are the record of what was compared. Ask before removing any.
