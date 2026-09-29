// Rejections (spec §5.6, §4.1 floor). Task 11 replaces this stub.
//
// applyRejections(entries, design, fileCtxs) -> entries
//   Called by the runner after every rule and before `intentional`. `entries` are the rule
//   findings with `id` and `file` resolved; `design` is ctx.design (or null); `fileCtxs` are
//   the per-file ctx objects. A `rule: X` rejection marks `floor: true` on the fails of X; a
//   `pattern` adds `{ id: 'R-nnn', status: 'fail', severity: 'bloquea', floor: true, key, file }`.
export const RULES = [];

export function applyRejections(entries, design, fileCtxs) {
  return entries;
}
