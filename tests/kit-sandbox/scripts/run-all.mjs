// Runs every kit interaction check, normal and with reduced motion, and prints a summary.
//
//   node scripts/run-all.mjs [slug ...]     (no slugs: every file in interact/)
//
// Needs `npm ci` in this folder and a Chrome: set PIGNOLO_UI_BROWSER if it is not the default path.
// One check at a time on purpose: two builds in the same folder give false failures.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);
const files = fs.readdirSync(path.join(root, "interact"))
  .filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs") && !f.startsWith("_"))
  .map((f) => f.replace(/\.mjs$/, ""))
  .filter((slug) => only.length === 0 || only.includes(slug));

// tabs-keys exercises the segmented tabs page.
const routeOf = (slug) => (slug === "tabs-keys" ? "segmented-tabs" : slug);

let pass = 0;
const failed = [];
for (const slug of files) {
  for (const mode of [[], ["--reduced"]]) {
    const args = [path.join("scripts", "check.mjs"), "--route", routeOf(slug), "--interact", path.join("interact", `${slug}.mjs`), ...mode];
    const run = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
    if (run.status === 0) pass++;
    else {
      failed.push(slug + (mode.length ? " --reduced" : ""));
      console.error(`FAIL ${slug} ${mode.join(" ")}\n${(run.stdout + run.stderr).split("\n").slice(-8).join("\n")}`);
    }
  }
}
console.log(`RESULT pass=${pass} fail=${failed.length}${failed.length ? " failed: " + failed.join(", ") : ""}`);
process.exit(failed.length ? 1 : 0);
