import { useState } from "react";
import { DragReorder, type DragItem } from "@kit/components/drag-reorder";

export const meta = { title: "Drag reorder" };

const labels = {
  list: "Prioridades del mes",
  grip: (e: DragItem) => `Mover ${e.label}`,
  moveUp: (e: DragItem) => `Subir ${e.label}`,
  moveDown: (e: DragItem) => `Bajar ${e.label}`,
  moved: (e: DragItem, position: number, total: number) => `${e.label}: posición ${position} de ${total}`,
  hint: "Arrastrá el asa, usá las flechas arriba y abajo con el asa enfocada, o tocá Subir y Bajar.",
};

const initial: DragItem[] = [
  { id: "a", label: "Planificar el mes" },
  { id: "b", label: "Revisar gastos" },
  { id: "c", label: "Pagar impuestos" },
  { id: "d", label: "Actualizar metas" },
  { id: "e", label: "Archivar recibos" },
];

export default function DragReorderPage() {
  const [items, setItems] = useState<DragItem[]>(initial);
  const [frozen, setFrozen] = useState<DragItem[]>(initial.slice(0, 3));
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Drag reorder</h1>
      <p className="mb-6 max-w-prose text-(--color-on-surface-variant)">
        Arrastrar el asa, usar el teclado o tocar Subir y Bajar (un toque, sin arrastrar). Pasado el borde la fila se estira con banda elástica y al soltar se proyecta 0,2 s
        con la velocidad.
      </p>

      <section className="mb-10 max-w-md" data-testid="drag-main">
        <DragReorder items={items} onReorder={setItems} labels={labels} />
        <p className="mt-4 text-sm text-(--color-on-surface-muted)" data-testid="drag-order">
          {items.map((i) => i.id).join(",")}
        </p>
      </section>

      <section className="max-w-md" data-testid="drag-disabled">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Deshabilitado</h2>
        <DragReorder items={frozen} onReorder={setFrozen} labels={{ ...labels, list: "Orden bloqueado" }} disabled />
      </section>
    </div>
  );
}
