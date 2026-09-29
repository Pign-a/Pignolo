// Rule contract for ui-check (spec §5). The runner (lib/ui-check.mjs) owns everything else.
//
// A rule module exports RULES = [{ id, checkFile?(ctx), checkProject?(pctx) }].
// Each function returns RawFinding[] and never throws (the runner turns an exception into
// `unverified (rule error: <message>)` and keeps running the others). Returning nothing for
// an applicable file makes the runner add a `pass` for that rule and file.
//
// RawFinding = { id?, status: 'pass'|'fail'|'unverified', reason?, line?, selector?, key,
//                measure?, severity?, floor?, file? }
//   id        defaults to the rule's id (COLOR-12 may report COLOR-03).
//   key       stable part of the fingerprint `<id>|<file>|<key>`; never a line number.
//             markup: tag + sorted static attributes (no class) + first 40 chars of normalized
//             text; CSS: selector + property + normalized value; tokens: pair and theme
//             (`on-surface/surface/dark`), never the values.
//   severity  only when the rule fixes it (CONTENT-01 heuristics `medio`, CONTENT-01 in a
//             mockup `detalle`, COLOR-03 reported from COLOR-12); otherwise the catalog's.
//             Ids outside the catalog (R-nnn, DESIGN-INVALID) must carry it.
//   floor     `true` only from rejections (Task 11).
//   file      project-relative path; only project rules set it (checkFile findings get ctx.file).
//
// ctx (per file) = { file, text, syntax, route, mockup, isDocument, markup, css, classLists,
//                    design, tokens, catalog }
// pctx (project) = { project, design, tokens, catalog, files }
// See lib/ui-check.mjs for how each field is built.

export function pass(key, extra = {}) {
  return { ...extra, status: 'pass', key };
}

export function fail(key, extra = {}) {
  return { ...extra, status: 'fail', key };
}

// The key defaults to the reason, so equal reasons aggregate into one entry.
export function unverified(reason, extra = {}) {
  return { key: reason, ...extra, status: 'unverified', reason };
}
