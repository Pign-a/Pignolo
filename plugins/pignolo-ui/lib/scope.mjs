// Scope of ui-check findings (spec §5.3). Task 10 replaces this stub.
//
// scopeRun({ project, base, relFiles, sourceFiles, designRel, evaluate }) -> base findings | null
//   Materializes `sourceFiles` at `base` in a temporary folder and returns
//   evaluate(dir, relFiles): the runner's closure with the same rules and catalog, whose
//   findings carry project-relative `file` and a `fingerprint`. null when there is no base.
// classifyScope(current, base) -> current with `scope: 'new' | 'debt'` on every entry.
export function scopeRun({ project, base, relFiles, sourceFiles, designRel, evaluate }) {
  return null;
}

export function classifyScope(current, base) {
  return current.map((e) => ({ ...e, scope: 'new' }));
}
