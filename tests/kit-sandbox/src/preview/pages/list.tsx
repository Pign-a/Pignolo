import { useState } from "react";
import { List, type ListEntry, type ListRemoval } from "@kit/components/list";

export const meta = { title: "List" };

const pool = [
  "Revisar presupuesto",
  "Llamar al contador",
  "Pagar alquiler",
  "Renovar seguro",
  "Ordenar facturas",
  "Armar informe",
  "Actualizar metas",
  "Cobrar a clientes",
  "Pedir presupuesto de imprenta",
  "Responder al proveedor",
];

const btnPrimary =
  "kit-focus min-h-(--target-recommended) rounded-(--radius-control) bg-(--color-primary) px-4 text-sm font-medium text-(--color-on-primary) hover:bg-(--color-primary-hover) active:bg-(--color-primary-pressed) disabled:opacity-(--state-disabled-content)";

const labels = {
  list: "Tareas",
  remove: (e: ListEntry) => `Quitar ${e.label}`,
  moveUp: (e: ListEntry) => `Subir ${e.label}`,
  moveDown: (e: ListEntry) => `Bajar ${e.label}`,
  removed: (e: ListEntry) => `${e.label} quitada`,
  moved: (e: ListEntry, position: number, total: number) => `${e.label}: posición ${position} de ${total}`,
};

function makeItems(from: number, count: number): ListEntry[] {
  return Array.from({ length: count }, (_, i) => ({ id: `t${from + i}`, label: pool[(from + i) % pool.length] ?? "Tarea" }));
}

export default function ListPage() {
  const [seq, setSeq] = useState(4);
  const [items, setItems] = useState<ListEntry[]>(() => makeItems(0, 4));
  const [many, setMany] = useState<ListEntry[]>(() =>
    Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, label: pool[i] ?? "Tarea", description: `Vence el ${10 + i} de noviembre` })),
  );
  const [plain, setPlain] = useState<ListEntry[]>(() => makeItems(2, 3));
  const [last, setLast] = useState<ListRemoval<ListEntry> | null>(null);

  // The app owns undo: it knows what was removed and where, so it can put it back.
  const undo = () => {
    if (!last) return;
    setItems((list) => {
      const next = list.slice();
      next.splice(Math.min(last.index, next.length), 0, last.entry);
      return next;
    });
    setLast(null);
  };

  const add = () => {
    setItems((list) => [{ id: `t${seq}`, label: pool[seq % pool.length] ?? "Tarea" }, ...list]);
    setSeq((s) => s + 1);
  };

  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">List</h1>
      <p className="mb-6 max-w-prose text-(--color-on-surface-variant)">
        Agregar, quitar y reordenar. Las demás filas se acomodan con el resorte directo; quitar varias seguidas sigue funcionando.
      </p>

      <section className="mb-12 max-w-md" data-testid="list-main">
        <div className="mb-4 flex items-center gap-3">
          <button type="button" className={btnPrimary} data-testid="list-add" onClick={add}>
            Agregar tarea
          </button>
          <span className="text-sm text-(--color-on-surface-muted)" data-testid="list-count">
            {items.length} tareas
          </span>
        </div>
        <List
          items={items}
          onChange={setItems}
          onRemove={setLast}
          labels={labels}
          empty={{
            title: "Empezá agregando una tarea",
            body: "Las tareas que agregues aparecen acá y las podés ordenar.",
            action: (
              <button type="button" className={btnPrimary} data-testid="list-empty-add" onClick={add}>
                Agregar tarea
              </button>
            ),
          }}
        />
        <p className="mt-3 flex items-center gap-3 text-sm text-(--color-on-surface-muted)" data-testid="list-last">
          {last ? (
            <>
              <span data-testid="list-last-text">
                Quitada: {last.entry.label} ({last.via === "shortcut" ? "con el teclado" : "con el botón"}, posición {last.index + 1})
              </span>
              <button
                type="button"
                data-testid="list-undo"
                onClick={undo}
                className="kit-focus min-h-(--target-min) rounded-(--radius-md) px-2 font-medium text-(--color-primary) hover:bg-(--color-primary-container)"
              >
                Deshacer
              </button>
            </>
          ) : (
            "Nada quitado todavía."
          )}
        </p>
      </section>

      <section className="mb-12 max-w-md" data-testid="list-many">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Diez filas con detalle</h2>
        <List items={many} onChange={setMany} labels={labels} empty={{ title: "No quedan tareas" }} />
      </section>

      <section className="max-w-md" data-testid="list-plain">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Solo quitar</h2>
        <List items={plain} onChange={setPlain} labels={labels} reorderable={false} empty={{ title: "No quedan tareas" }} />
      </section>
      <div aria-hidden="true" style={{ height: 800 }} />
    </div>
  );
}
