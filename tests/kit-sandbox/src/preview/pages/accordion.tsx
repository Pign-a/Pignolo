import { useState } from "react";
import { Accordion, type AccordionItem } from "@kit/components/accordion";

export const meta = { title: "Accordion" };

const faq: AccordionItem[] = [
  { value: "saldo", title: "¿Cómo se calcula el saldo?", content: "Suma los ingresos del período y resta los gastos ya confirmados. Los gastos pendientes no entran hasta que los confirmás." },
  { value: "exportar", title: "¿Puedo exportar mis datos?", content: "Sí. Desde Informes podés descargar un archivo con todos los movimientos del período que elijas." },
  { value: "moneda", title: "¿Qué moneda se usa?", content: "Todos los importes están expresados en pesos argentinos (ARS)." },
  { value: "plan", title: "Plan anual", content: "Disponible para cuentas con más de un año.", disabled: true },
];

export default function AccordionPage() {
  const [value, setValue] = useState("saldo");
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Accordion</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">Secciones que se abren y cierran. Una sola abierta, o varias a la vez.</p>
      <div className="grid gap-8 md:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-(--color-on-surface-variant)">Una sección abierta a la vez</h2>
          <div data-testid="acc-single">
            <Accordion items={faq} value={value} onValueChange={setValue} />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Abierta: <span data-testid="acc-value">{value || "ninguna"}</span>
          </p>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-(--color-on-surface-variant)">Varias abiertas</h2>
          <div data-testid="acc-multi">
            <Accordion type="multiple" items={faq} defaultValue={["moneda", "exportar"]} />
          </div>
        </section>
      </div>
    </div>
  );
}
