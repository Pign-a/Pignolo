import { useState } from "react";
import { MonthPicker, type MonthPickerLabels, type MonthValue } from "@kit/components/month-picker";

export const meta = { title: "Month picker" };

const labels: MonthPickerLabels = {
  previousMonth: "Mes anterior",
  nextMonth: "Mes siguiente",
  previousYear: "Año anterior",
  nextYear: "Año siguiente",
  previousDecade: "Década anterior",
  nextDecade: "Década siguiente",
  changeMonth: "Cambiar mes",
  changeYear: "Cambiar año",
  today: "Hoy",
  thisMonth: "Este mes",
  choose: "Elegir mes",
  close: "Cerrar",
  typeLabel: "Escribir el mes",
  hint: "Formato mm/aaaa, por ejemplo 03/2026",
  errors: {
    format: "No entendimos ese mes. Escribí algo como 03/2026.",
    range: "Ese mes está fuera del período permitido.",
    incomplete: "Falta el año. Escribí algo como 03/2026.",
    month: "El mes va de 1 a 12, o es el nombre de un mes.",
    year: "El año tiene 2 o 4 cifras.",
  },
};

const english: MonthPickerLabels = {
  previousMonth: "Previous month",
  nextMonth: "Next month",
  previousYear: "Previous year",
  nextYear: "Next year",
  previousDecade: "Previous decade",
  nextDecade: "Next decade",
  changeMonth: "Change month",
  changeYear: "Change year",
  today: "Today",
  thisMonth: "This month",
  choose: "Choose month",
  close: "Close",
  typeLabel: "Type the month",
  hint: "Format mm/yyyy, for example 03/2026",
  errors: { format: "We could not read that month.", range: "That month is outside the allowed period." },
};

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
      <h2 className="mb-3 text-sm font-semibold text-(--color-on-surface-variant)">{title}</h2>
      {children}
    </section>
  );
}

export default function MonthPickerPage() {
  const [free, setFree] = useState<MonthValue>({ year: 2026, month: 9 });
  const [limited, setLimited] = useState<MonthValue>({ year: 2026, month: 11 });
  const [wide, setWide] = useState<MonthValue>({ year: 2026, month: 2 });
  const [sheet, setSheet] = useState<MonthValue>({ year: 2026, month: 5 });
  const [posted, setPosted] = useState("nada");
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Month picker</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Mes y año. Las flechas cambian de mes y el texto entra desde el lado hacia el que avanzás; el botón central abre la grilla, el botón del año abre las décadas y el campo de texto acepta 03/2026, mar 2026 o 2026-03.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Cell title="Libre (dentro de un form)">
          <form
            data-testid="mp-free"
            onSubmit={(e) => {
              e.preventDefault();
              setPosted(JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))));
            }}
          >
            <MonthPicker label="Período" labels={labels} value={free} onValueChange={setFree} name="periodo" />
          </form>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="free-value">{`${free.year}-${free.month}`}</span>
          </p>
          <p className="mt-1 text-sm text-(--color-on-surface-muted)">
            Hidden: <span data-testid="free-hidden">{posted}</span>
          </p>
          <button type="button" data-testid="free-post" className="kit-focus mt-2 min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface)" onClick={(e) => (e.currentTarget.closest("section")?.querySelector("form") as HTMLFormElement).requestSubmit()}>
            Leer el form
          </button>
        </Cell>
        <Cell title="Entre marzo y diciembre de 2026">
          <div data-testid="mp-limited">
            <MonthPicker label="Período del informe" labels={labels} value={limited} onValueChange={setLimited} min={{ year: 2026, month: 2 }} max={{ year: 2026, month: 11 }} />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="limited-value">{`${limited.year}-${limited.month}`}</span>
          </p>
        </Cell>
        <Cell title="Entre 1900 y 2100">
          <div data-testid="mp-wide">
            <MonthPicker label="Período histórico" labels={labels} value={wide} onValueChange={setWide} min={{ year: 1900, month: 0 }} max={{ year: 2100, month: 11 }} />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="wide-value">{`${wide.year}-${wide.month}`}</span>
          </p>
        </Cell>
        <Cell title="Hoja inferior (como en el celular)">
          <div data-testid="mp-sheet">
            <MonthPicker label="Período en hoja" labels={labels} value={sheet} onValueChange={setSheet} presentation="sheet" />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="sheet-value">{`${sheet.year}-${sheet.month}`}</span>
          </p>
        </Cell>
        <Cell title="Inglés">
          <MonthPicker label="Period" locale="en" labels={english} defaultValue={{ year: 2026, month: 2 }} />
        </Cell>
        <Cell title="Deshabilitado">
          <MonthPicker label="Período bloqueado" labels={labels} defaultValue={{ year: 2026, month: 0 }} disabled />
        </Cell>
      </div>
      <div className="h-96" />
    </div>
  );
}
