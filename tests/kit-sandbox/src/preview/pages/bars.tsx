import { useState } from "react";
import { Bars } from "@kit/components/bars";

export const meta = { title: "Bars" };

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const full = (n: number) => ars.format(n);
const short = (n: number) => (n >= 1000 ? `${n / 1000} mil` : String(n));

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun"];

const btn =
  "kit-focus min-h-(--target-recommended) rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container) active:bg-(--color-surface-container)";

const gastosA = [45000, 70000, 55000, 90000, 65000, 80000];
const gastosB = [82000, 30000, 76000, 40000, 95000, 22000];
const manyDays = Array.from({ length: 18 }, (_, i) => String(i + 1));
const manyValues = manyDays.map((_, i) => 200 + ((i * 37) % 11) * 40);

export default function BarsPage() {
  const [replay, setReplay] = useState(0);
  const [manyReplay, setManyReplay] = useState(0);
  const [altData, setAltData] = useState(false);
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Bars</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Las barras crecen una por una (90 ms entre cada una, hasta 0,6 s en total) cuando el gráfico entra en pantalla. Si los datos
        cambian, las alturas se acomodan con el resorte directo. Cada barra dice su valor y hay una tabla con los mismos datos.
      </p>

      <section className="mb-12" data-testid="bars-single">
        <Bars
          title="Gastos por mes"
          categories={months}
          series={[{ id: "gastos", label: "Gastos", values: altData ? gastosB : gastosA }]}
          format={full}
          formatTick={short}
          categoryHeader="Mes"
          showTableLabel="Ver como tabla"
          hideTableLabel="Ocultar tabla"
          replayKey={replay}
        />
        <button type="button" className={`${btn} mt-4`} data-testid="bars-replay" onClick={() => setReplay((r) => r + 1)}>
          Repetir animación
        </button>
        <button type="button" className={`${btn} mt-4 ml-2`} data-testid="bars-change" onClick={() => setAltData((v) => !v)}>
          Cambiar datos
        </button>
      </section>

      <section className="mb-12" data-testid="bars-many">
        <Bars
          title="Gastos por día (18 barras)"
          categories={manyDays}
          series={[{ id: "dia", label: "Gastos", values: manyValues }]}
          format={full}
          formatTick={short}
          categoryHeader="Día"
          showTableLabel="Ver como tabla"
          hideTableLabel="Ocultar tabla"
          replayKey={manyReplay}
        />
        <button type="button" className={`${btn} mt-4`} data-testid="bars-many-replay" onClick={() => setManyReplay((r) => r + 1)}>
          Repetir las 18
        </button>
      </section>

      <section className="mb-12" data-testid="bars-multi">
        <Bars
          title="Ingresos, gastos y ahorro"
          categories={months}
          series={[
            { id: "ingresos", label: "Ingresos", values: [120000, 135000, 128000, 150000, 142000, 160000] },
            { id: "gastos", label: "Gastos", values: [85000, 92000, 88000, 110000, 97000, 105000] },
            { id: "ahorro", label: "Ahorro", values: [35000, 43000, 40000, 40000, 45000, 55000] },
          ]}
          format={full}
          formatTick={short}
          categoryHeader="Mes"
          showTableLabel="Ver como tabla"
          hideTableLabel="Ocultar tabla"
        />
      </section>

      <section className="mb-12" data-testid="bars-empty">
        <Bars
          title="Gastos por categoría"
          categories={[]}
          series={[]}
          categoryHeader="Categoría"
          showTableLabel="Ver como tabla"
          hideTableLabel="Ocultar tabla"
          emptyLabel="Todavía no hay gastos cargados para mostrar."
        />
      </section>

      <div aria-hidden="true" data-testid="bars-spacer" style={{ height: 900 }} />

      <section className="mb-12" data-testid="bars-late">
        <Bars
          title="Visitas por día (empieza al llegar acá)"
          categories={["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]}
          series={[{ id: "visitas", label: "Visitas", values: [320, 410, 380, 520, 610, 280, 190] }]}
          categoryHeader="Día"
          showTableLabel="Ver como tabla"
          hideTableLabel="Ocultar tabla"
        />
      </section>
    </div>
  );
}
