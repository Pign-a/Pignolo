/**
 * Tiny class-name joiner (clsx-like, no dependency).
 * It does not resolve Tailwind conflicts: put overrides last and avoid
 * passing two utilities for the same property.
 */
export type ClassValue = string | number | false | null | undefined | ClassValue[] | { [name: string]: unknown };

export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  for (const v of values) {
    if (!v && v !== 0) continue;
    if (typeof v === "string" || typeof v === "number") out.push(String(v));
    else if (Array.isArray(v)) {
      const inner = cn(...v);
      if (inner) out.push(inner);
    } else {
      for (const key of Object.keys(v)) if (v[key]) out.push(key);
    }
  }
  return out.join(" ");
}
