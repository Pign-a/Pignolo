import { useState } from "react";
import { SegmentedTabs } from "@kit/components/segmented-tabs";

export const meta = { title: "Segmented tabs" };

const text = "text-sm text-(--color-on-surface-variant)";
const periods = [
  { value: "dia", label: "Día", content: <p className={text}>Hoy: 3 movimientos por $ 18.400.</p> },
  { value: "semana", label: "Semana", content: <p className={text}>Esta semana: 14 movimientos por $ 96.250.</p> },
  { value: "mes", label: "Mes", content: <p className={text}>Este mes: 52 movimientos por $ 482.300.</p> },
  { value: "anio", label: "Año", content: <p className={text}>Este año: 611 movimientos por $ 5.120.000.</p> },
];

export default function SegmentedTabsPage() {
  const [filter, setFilter] = useState("todos");
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Segmented tabs</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Cambiá de período con el mouse o con las flechas izquierda y derecha. Probá cambiar varias veces seguidas.
      </p>

      <section className="mb-10 max-w-md" data-testid="seg-main">
        <SegmentedTabs ariaLabel="Período" items={periods} defaultValue="semana" />
      </section>

      <section className="mb-10 max-w-md">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Ancho completo, tamaño chico, sin paneles</h2>
        <SegmentedTabs
          ariaLabel="Filtro de movimientos"
          size="sm"
          fullWidth
          value={filter}
          onValueChange={setFilter}
          items={[
            { value: "todos", label: "Todos" },
            { value: "ingresos", label: "Ingresos" },
            { value: "gastos", label: "Gastos" },
            { value: "pendientes", label: "Pendientes", disabled: true },
          ]}
        />
        <p className="mt-3 text-sm text-(--color-on-surface-muted)">
          Filtro: <span data-testid="filter">{filter}</span>
        </p>
      </section>
    </div>
  );
}
