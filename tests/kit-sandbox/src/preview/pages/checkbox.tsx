import { useState } from "react";
import { Checkbox, type CheckedState } from "@kit/components/checkbox";

export const meta = { title: "Checkbox" };

export default function CheckboxPage() {
  const [items, setItems] = useState({ gastos: true, ingresos: false, ahorro: false });
  const [terms, setTerms] = useState<CheckedState>(false);
  const values = Object.values(items);
  const all: CheckedState = values.every(Boolean) ? true : values.some(Boolean) ? "indeterminate" : false;
  const setAll = (v: CheckedState) => setItems({ gastos: v === true, ingresos: v === true, ahorro: v === true });

  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Checkbox</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        La marca se dibuja al activarse; el guion aparece cuando la selección es parcial.
      </p>

      <section className="mb-10 max-w-md rounded-(--radius-lg) border border-(--color-border-subtle) px-5 py-2">
        <Checkbox label="Incluir todo el reporte" checked={all} onCheckedChange={setAll} data-testid="cb-all" />
        <div className="ml-8 border-l border-(--color-border-subtle) pl-4">
          <Checkbox label="Gastos" checked={items.gastos} onCheckedChange={(v) => setItems((s) => ({ ...s, gastos: v === true }))} data-testid="cb-gastos" />
          <Checkbox label="Ingresos" checked={items.ingresos} onCheckedChange={(v) => setItems((s) => ({ ...s, ingresos: v === true }))} data-testid="cb-ingresos" />
          <Checkbox label="Ahorro" description="Incluye metas y fondos" checked={items.ahorro} onCheckedChange={(v) => setItems((s) => ({ ...s, ahorro: v === true }))} data-testid="cb-ahorro" />
        </div>
      </section>

      <section className="mb-10 max-w-md rounded-(--radius-lg) border border-(--color-border-subtle) px-5 py-2">
        <Checkbox
          label="Acepto los términos del servicio"
          description={terms === true ? undefined : "Necesitás aceptarlos para continuar"}
          invalid={terms !== true}
          checked={terms}
          onCheckedChange={setTerms}
          data-testid="cb-terms"
        />
        <Checkbox label="Recibir novedades por correo" defaultChecked disabled data-testid="cb-disabled-on" />
        <Checkbox label="Recibir ofertas" disabled data-testid="cb-disabled-off" />
      </section>

      <p className="text-sm text-(--color-on-surface-muted)">
        Estado: <span data-testid="state">{String(all)}</span> · términos: <span data-testid="terms">{String(terms)}</span>
      </p>
    </div>
  );
}
