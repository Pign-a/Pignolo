import { useEffect, useState } from "react";
import { cn } from "@kit/lib/cn";
import { entries } from "./registry";

function slugFromHash(): string {
  const raw = window.location.hash.replace(/^#\/?/, "");
  return raw || "foundation";
}

type Theme = "system" | "light" | "dark";

export function App() {
  const [slug, setSlug] = useState(slugFromHash);
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const onHash = () => setSlug(slugFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  // check.mjs can force a theme with ?theme=light|dark
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("theme");
    if (t === "light" || t === "dark") setTheme(t);
  }, []);

  const current = entries.find((e) => e.slug === slug) ?? entries[0];

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row">
      <nav aria-label="Components" className="md:w-48 md:shrink-0">
        <p className="mb-3 text-sm font-semibold text-(--color-on-surface)">Kit sandbox</p>
        <ul className="flex flex-wrap gap-1 md:flex-col">
          {entries.map((e) => (
            <li key={e.slug}>
              <a
                href={`#/${e.slug}`}
                aria-current={current?.slug === e.slug ? "page" : undefined}
                className={cn(
                  "kit-focus block rounded-(--radius-md) px-3 py-1.5 text-sm text-(--color-on-surface-variant) hover:bg-(--color-surface-container)",
                  current?.slug === e.slug && "bg-(--color-primary-container) text-(--color-on-primary-container)",
                )}
              >
                {e.title}
              </a>
            </li>
          ))}
        </ul>
        <div role="group" aria-label="Theme" className="mt-4 flex gap-1">
          {(["system", "light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              aria-pressed={theme === t}
              className={cn(
                "kit-focus rounded-(--radius-md) border border-(--color-border-subtle) px-2 py-1 text-xs text-(--color-on-surface-variant)",
                theme === t && "bg-(--color-surface-container) text-(--color-on-surface)",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>
      <main className="min-w-0 flex-1" data-preview-page={current?.slug}>
        {current ? <current.Page /> : <p>No preview pages yet.</p>}
      </main>
    </div>
  );
}
