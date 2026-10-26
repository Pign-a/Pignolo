import { useState } from "react";
import { DateRangePicker, type DateRange, type DateRangeLabels } from "@kit/components/date-range-picker";

export const meta = { title: "Date range picker" };

const labels: DateRangeLabels = {
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
  choose: "Elegir fechas",
  close: "Cerrar",
  typeLabel: "Escribir la fecha",
  hint: "Formato dd/mm/aaaa, por ejemplo 05/03/2026",
  startLabel: "Fecha de inicio",
  endLabel: "Fecha de fin",
  startAnnounce: "fecha de inicio",
  endAnnounce: "fecha de fin",
  clear: "Borrar fechas",
  nights: (n) => (n === 1 ? "1 noche" : `${n} noches`),
  errors: {
    format: "No entendimos esa fecha. Escribí algo como 05/03/2026.",
    range: "Esa fecha está fuera del rango permitido.",
    incomplete: "Falta una parte de la fecha. Escribí día, mes y año.",
    month: "El mes va de 1 a 12, o es el nombre de un mes.",
    day: "Ese día no existe en ese mes.",
    year: "El año tiene 2 o 4 cifras.",
    order: "La fecha de fin es anterior a la de inicio.",
    minNights: "La estadía mínima es de 2 noches.",
  },
};

const english: DateRangeLabels = {
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
  choose: "Choose dates",
  close: "Close",
  typeLabel: "Type the date",
  hint: "Format mm/dd/yyyy, for example 03/05/2026",
  startLabel: "Start date",
  endLabel: "End date",
  startAnnounce: "start date",
  endAnnounce: "end date",
  clear: "Clear dates",
  nights: (n) => (n === 1 ? "1 night" : `${n} nights`),
  errors: { format: "We could not read that date.", range: "That date is outside the allowed range.", order: "The end date is before the start date.", minNights: "The minimum stay is 2 nights." },
};

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
      <h2 className="mb-3 text-sm font-semibold text-(--color-on-surface-variant)">{title}</h2>
      {children}
    </section>
  );
}

const iso = (v: { year: number; month: number; day: number } | null) => (v ? `${v.year}-${v.month}-${v.day}` : "-");
const show = (r: DateRange) => `${iso(r.start)} / ${iso(r.end)}`;

export default function DateRangePickerPage() {
  const [free, setFree] = useState<DateRange>({ start: { year: 2026, month: 9, day: 20 }, end: { year: 2026, month: 9, day: 27 } });
  const [stay, setStay] = useState<DateRange>({ start: null, end: null });
  const [sheet, setSheet] = useState<DateRange>({ start: null, end: null });
  const [posted, setPosted] = useState("nada");
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Date range picker</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Elegí la fecha de inicio y la de fin en el calendario, o escribilas. La banda muestra los días entre las dos y, antes de elegir la segunda, una vista previa bajo el puntero.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Cell title="Libre (dentro de un form)">
          <form
            data-testid="rp-free"
            onSubmit={(e) => {
              e.preventDefault();
              setPosted(JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))));
            }}
          >
            <DateRangePicker label="Período del gasto" labels={labels} value={free} onValueChange={setFree} name="periodo" />
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
        <Cell title="Hospedaje: del 10 de noviembre de 2030 al 20 de febrero de 2031, 2 noches como mínimo">
          <div data-testid="rp-stay">
            <DateRangePicker label="Estadía" labels={labels} value={stay} onValueChange={setStay} min={{ year: 2030, month: 10, day: 10 }} max={{ year: 2031, month: 1, day: 20 }} minNights={2} />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="stay-value">{show(stay)}</span>
          </p>
        </Cell>
        <Cell title="Un solo mes (columna angosta)">
          <div data-testid="rp-one">
            <DateRangePicker label="Reserva" labels={labels} months={1} defaultValue={{ start: null, end: null }} />
          </div>
        </Cell>
        <Cell title="Hoja inferior (como en el celular)">
          <div data-testid="rp-sheet">
            <DateRangePicker label="Viaje" labels={labels} value={sheet} onValueChange={setSheet} presentation="sheet" />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="sheet-value">{show(sheet)}</span>
          </p>
        </Cell>
        <Cell title="Inglés (EE. UU.)">
          <div data-testid="rp-en">
            <DateRangePicker label="Trip" locale="en-US" labels={english} defaultValue={{ start: { year: 2026, month: 2, day: 5 }, end: { year: 2026, month: 2, day: 9 } }} />
          </div>
        </Cell>
        <Cell title="Deshabilitado">
          <DateRangePicker label="Bloqueado" labels={labels} defaultValue={{ start: { year: 2026, month: 0, day: 1 }, end: { year: 2026, month: 0, day: 5 } }} disabled />
        </Cell>
      </div>
      <div className="h-96" />
    </div>
  );
}
