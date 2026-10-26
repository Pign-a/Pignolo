import { useState } from "react";
import { BottomSheet } from "@kit/components/bottom-sheet";

export const meta = { title: "Bottom sheet" };

const primary =
  "kit-focus min-h-10 rounded-(--radius-control) bg-(--color-primary) px-4 text-sm font-medium text-(--color-on-primary) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-primary-hover) active:scale-[0.97] active:bg-(--color-primary-pressed)";
const secondary =
  "kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) transition-[scale,background-color] duration-75 ease-out hover:bg-(--color-surface-container) active:scale-[0.97] active:bg-(--color-border-subtle)";

const currencies = ["Peso argentino", "Dólar estadounidense", "Euro", "Real brasileño", "Peso chileno", "Peso uruguayo", "Guaraní", "Boliviano", "Sol peruano", "Peso colombiano", "Peso mexicano", "Libra esterlina", "Yen", "Franco suizo"];

export default function BottomSheetPage() {
  const [share, setShare] = useState(false);
  const [pick, setPick] = useState(false);
  const [chosen, setChosen] = useState("ninguna");
  const [log, setLog] = useState("ninguna");
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Bottom sheet</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Hoja inferior arrastrable. Tirá desde el encabezado: un gesto rápido la cierra aunque sea corto; uno lento y corto la devuelve a su lugar.
      </p>
      <div data-testid="wrap" className="h-28 overflow-hidden rounded-(--radius-lg) border border-(--color-border-subtle) p-4">
        <div className="flex flex-wrap gap-3">
          <button type="button" data-testid="open-share" className={primary} onClick={() => setShare(true)}>
            Abrir hoja
          </button>
          <button type="button" data-testid="open-pick" className={secondary} onClick={() => setPick(true)}>
            Elegir moneda
          </button>
        </div>
      </div>
      <p className="mt-4 text-sm text-(--color-on-surface-muted)">
        Última acción: <span data-testid="log">{log}</span>. Moneda: <span data-testid="chosen">{chosen}</span>
      </p>

      <BottomSheet
        open={share}
        onOpenChange={setShare}
        title="Compartir informe"
        description="Elegí cómo querés enviarlo."
        closeLabel="Cerrar"
        footer={
          <button
            type="button"
            data-testid="done"
            className={primary}
            onClick={() => {
              setLog("listo");
              setShare(false);
            }}
          >
            Listo
          </button>
        }
      >
        <ul className="m-0 flex list-none flex-col p-0">
          <li className="flex min-h-12 items-center justify-between border-b border-(--color-border-subtle) text-sm text-(--color-on-surface)">
            <span>Enlace privado</span>
            <button type="button" className="kit-focus rounded-(--radius-md) px-2 py-1 text-sm font-medium text-(--color-primary) hover:bg-(--color-primary-container)" onClick={() => setLog("enlace copiado")}>
              Copiar
            </button>
          </li>
          <li className="flex min-h-12 items-center justify-between text-sm text-(--color-on-surface)">
            <span>Enviar por correo</span>
            <button type="button" className="kit-focus rounded-(--radius-md) px-2 py-1 text-sm font-medium text-(--color-primary) hover:bg-(--color-primary-container)" onClick={() => setLog("correo")}>
              Abrir
            </button>
          </li>
        </ul>
      </BottomSheet>

      <BottomSheet open={pick} onOpenChange={setPick} title="Elegir moneda" closeLabel="Cerrar">
        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-(--color-on-surface)">
          Buscar
          <input
            data-testid="search"
            data-autofocus=""
            className="kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) bg-(--color-surface) px-3 text-sm font-normal text-(--color-on-surface)"
          />
        </label>
        <ul data-testid="currency-list" className="m-0 flex list-none flex-col p-0">
          {currencies.map((c) => (
            <li key={c}>
              <button
                type="button"
                className="kit-focus flex min-h-12 w-full items-center rounded-(--radius-md) px-2 text-left text-sm text-(--color-on-surface) hover:bg-(--color-surface-container)"
                onClick={() => {
                  setChosen(c);
                  setPick(false);
                }}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </div>
  );
}
