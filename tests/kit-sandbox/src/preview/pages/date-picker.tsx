import { useState } from "react";
import { DatePicker, type DatePickerLabels, type DateValue } from "@kit/components/date-picker";

export const meta = { title: "Date picker" };

const labels: DatePickerLabels = {
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
  choose: "Elegir fecha",
  close: "Cerrar",
  typeLabel: "Escribir la fecha",
  hint: "Formato dd/mm/aaaa, por ejemplo 05/03/2026",
  errors: {
    format: "No entendimos esa fecha. Escribí algo como 05/03/2026.",
    range: "Esa fecha está fuera del rango permitido.",
    incomplete: "Falta una parte de la fecha. Escribí día, mes y año.",
    month: "El mes va de 1 a 12, o es el nombre de un mes.",
    day: "Ese día no existe en ese mes.",
    year: "El año tiene 2 o 4 cifras.",
  },
};

const english: DatePickerLabels = {
  ...labels,
  previousMonth: "Previous month",
  nextMonth: "Next month",
  previousYear: "Previous year",
  nextYear: "Next year",
  previousDecade: "Previous decade",
  nextDecade: "Next decade",
  changeMonth: "Change month",
  changeYear: "Change year",
  today: "Today",
  choose: "Choose date",
  close: "Close",
  typeLabel: "Type the date",
  hint: "Format mm/dd/yyyy, for example 03/05/2026",
  errors: { format: "We could not read that date.", range: "That date is outside the allowed range." },
};

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
      <h2 className="mb-3 text-sm font-semibold text-(--color-on-surface-variant)">{title}</h2>
      {children}
    </section>
  );
}

const show = (v: DateValue | null) => (v ? `${v.year}-${String(v.month + 1).padStart(2, "0")}-${String(v.day).padStart(2, "0")}` : "ninguna");

export default function DatePickerPage() {
  const [free, setFree] = useState<DateValue | null>({ year: 2026, month: 9, day: 25 });
  const [limited, setLimited] = useState<DateValue | null>(null);
  const [edge, setEdge] = useState<DateValue | null>({ year: 2024, month: 0, day: 31 });
  const [sheet, setSheet] = useState<DateValue | null>(null);
  const [posted, setPosted] = useState("nada");
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Date picker</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Escribí la fecha (5/3/26, 5 mar 2026, 2026-03-05) o abrí el calendario. El mes y el año del encabezado abren sus grillas.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Cell title="Libre (dentro de un form)">
          <form
            data-testid="dp-free"
            onSubmit={(e) => {
              e.preventDefault();
              setPosted(JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))));
            }}
          >
            <DatePicker label="Fecha del gasto" labels={labels} value={free} onValueChange={setFree} name="fecha" />
          </form>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="free-value">{show(free)}</span>
          </p>
          <p className="mt-1 text-sm text-(--color-on-surface-muted)">
            Hidden: <span data-testid="free-hidden">{posted}</span>
          </p>
          <button type="button" data-testid="free-post" className="kit-focus mt-2 min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface)" onClick={(e) => (e.currentTarget.closest("section")?.querySelector("form") as HTMLFormElement).requestSubmit()}>
            Leer el form
          </button>
        </Cell>
        <Cell title="Entre el 10 de marzo y el 20 de diciembre de 2026">
          <div data-testid="dp-limited">
            <DatePicker label="Fecha de vencimiento" labels={labels} value={limited} onValueChange={setLimited} min={{ year: 2026, month: 2, day: 10 }} max={{ year: 2026, month: 11, day: 20 }} />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="limited-value">{show(limited)}</span>
          </p>
        </Cell>
        <Cell title="Bisiesto y fin de mes">
          <div data-testid="dp-edge">
            <DatePicker label="Fecha de alta" labels={labels} value={edge} onValueChange={setEdge} />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="edge-value">{show(edge)}</span>
          </p>
        </Cell>
        <Cell title="Hoja inferior (como en el celular)">
          <div data-testid="dp-sheet">
            <DatePicker label="Fecha en hoja" labels={labels} value={sheet} onValueChange={setSheet} presentation="sheet" />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="sheet-value">{show(sheet)}</span>
          </p>
        </Cell>
        <Cell title="Inglés (EE. UU.)">
          <DatePicker label="Date" locale="en-US" labels={english} defaultValue={{ year: 2026, month: 2, day: 5 }} />
        </Cell>
        <Cell title="Requerido y deshabilitado">
          <div className="flex flex-col gap-4">
            <DatePicker label="Fecha requerida" labels={labels} required />
            <DatePicker label="Fecha bloqueada" labels={labels} defaultValue={{ year: 2026, month: 0, day: 1 }} disabled />
          </div>
        </Cell>
      </div>
      <div className="h-96" />
    </div>
  );
}
