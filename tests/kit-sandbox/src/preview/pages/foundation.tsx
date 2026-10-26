import { useState } from "react";
import * as m from "motion/react-m";
import { coarseTarget, presets, pressClass, rubberBand, useMotionTier, type TierName } from "@kit/motion";

export const meta = { title: "Foundation" };

const colorTokens = [
  "background",
  "surface",
  "surface-container",
  "on-surface",
  "on-surface-variant",
  "on-surface-muted",
  "outline",
  "primary",
  "on-primary",
  "primary-hover",
  "primary-pressed",
  "primary-container",
  "on-primary-container",
  "success",
  "warning",
  "error",
];

const status = [
  { name: "success", mark: "✓", label: "Saved" },
  { name: "warning", mark: "!", label: "Check this" },
  { name: "error", mark: "×", label: "Failed" },
] as const;

const radii = ["sm", "md", "lg", "xl", "full"] as const;
const spaces = ["1", "2", "3", "4", "6", "8", "12", "16"] as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">{title}</h2>
      {children}
    </section>
  );
}

function TierDemo({ name }: { name: TierName }) {
  const t = useMotionTier(name);
  const [on, setOn] = useState(false);
  return (
    <div className="mb-4 rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-(--color-on-surface)" data-testid={`tier-spec-${name}`}>
          <span className="font-semibold">{name}</span>{" "}
          <span className="text-(--color-on-surface-muted)">
            {t.tier.visualDuration} s, bounce {t.tier.bounce}, exit {Math.round(t.tier.exit * 1000)} ms
            {t.tier.stagger ? `, stagger ${Math.round(t.tier.stagger * 1000)} ms` : ""}
          </span>
        </p>
        <button
          type="button"
          data-testid={`tier-toggle-${name}`}
          onClick={() => setOn((v) => !v)}
          className={`kit-focus ${pressClass} ${coarseTarget} min-h-(--target-recommended) rounded-(--radius-control) bg-(--color-primary) px-4 text-sm font-medium text-(--color-on-primary) hover:bg-(--color-primary-hover) active:bg-(--color-primary-pressed) disabled:opacity-(--state-disabled-content)`}
        >
          Move
        </button>
      </div>
      <div className="h-14 rounded-(--radius-md) bg-(--color-surface-container) p-2">
        <m.div
          data-testid={`tier-box-${name}`}
          data-on={on}
          className="h-10 w-10 rounded-(--radius-md) bg-(--color-primary)"
          animate={{ x: on ? t.distance(200) : 0, opacity: t.reduced ? (on ? 0.4 : 1) : 1 }}
          transition={t.spring}
        />
      </div>
    </div>
  );
}

export default function Foundation() {
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Foundation</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Tokens, type and the three spring tiers. Components are added as separate pages.
      </p>

      <Section title="Colors">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {colorTokens.map((n) => (
            <li key={n} className="text-xs text-(--color-on-surface-variant)">
              <div
                className="mb-1 h-12 rounded-(--radius-md) border border-(--color-border-subtle)"
                style={{ background: `var(--color-${n})` }}
              />
              {n}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Status marks">
        <ul className="flex flex-wrap gap-3">
          {status.map((s) => (
            <li
              key={s.name}
              className="flex items-center gap-2 rounded-(--radius-full) px-3 py-1 text-sm"
              style={{ background: `var(--color-${s.name}-container)`, color: `var(--color-on-${s.name}-container)` }}
            >
              <span aria-hidden="true" className="font-semibold" style={{ color: `var(--color-${s.name})` }}>
                {s.mark}
              </span>
              {s.label}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <p className="text-3xl font-semibold tracking-tight">Headline 30</p>
        <p className="text-xl font-semibold">Title 20</p>
        <p className="text-base">Body 16, regular weight on the surface color.</p>
        <p className="text-sm text-(--color-on-surface-variant)">Secondary 14</p>
        <p className="text-xs text-(--color-on-surface-muted)">Muted 12</p>
      </Section>

      <Section title="Radii and spacing">
        <div className="mb-4 flex flex-wrap gap-3">
          {radii.map((r) => (
            <div key={r} className="text-center text-xs text-(--color-on-surface-variant)">
              <div
                className="mb-1 h-12 w-12 border border-(--color-outline) bg-(--color-surface-container)"
                style={{ borderRadius: `var(--radius-${r})` }}
              />
              {r}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {spaces.map((s) => (
            <div key={s} className="text-center text-xs text-(--color-on-surface-variant)">
              <div
                className="mb-1 bg-(--color-primary)"
                style={{ width: `var(--space-${s})`, height: `var(--space-${s})` }}
              />
              {s}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Elevation and focus">
        <div className="mb-4 flex flex-wrap gap-4">
          {[1, 2, 3].map((l) => (
            <div
              key={l}
              className="flex h-16 w-24 items-center justify-center rounded-(--radius-lg) bg-(--color-surface) text-xs text-(--color-on-surface-variant)"
              style={{ boxShadow: `var(--elevation-${l})` }}
            >
              level {l}
            </div>
          ))}
        </div>
        <button
          type="button"
          data-testid="focus-probe"
          className="kit-focus min-h-(--target-recommended) rounded-(--radius-control) border border-(--color-outline) px-4 text-sm"
        >
          Tab to see the ring
        </button>
      </Section>

      <Section title="Spring tiers">
        <TierDemo name="direct" />
        <TierDemo name="momentum" />
        <TierDemo name="data" />
        <p className="text-xs text-(--color-on-surface-muted)">
          Rubber band at 80 px overshoot in a 400 px container:{" "}
          <span data-testid="rubber">{rubberBand(80, 400).toFixed(1)}</span> px (factor {presets.drag.rubberBand}).
        </p>
      </Section>
    </div>
  );
}
