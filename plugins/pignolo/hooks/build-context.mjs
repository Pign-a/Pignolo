// Writes session-context.json (what the SessionStart hook prints) from session-context.md.
//   node plugins/pignolo/hooks/build-context.mjs
// The hook only runs `cat` on the JSON, so nothing is computed at session start; the repo test
// (tests/plugin-layout.test.js) fails when the two files drift apart.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const text = fs.readFileSync(path.join(dir, "session-context.md"), "utf8").replace(/\r\n/g, "\n").trimEnd();
const out = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: `<IMPORTANT>\n${text}\n</IMPORTANT>` } };
fs.writeFileSync(path.join(dir, "session-context.json"), JSON.stringify(out, null, 2) + "\n");
console.log("session-context.json written");
