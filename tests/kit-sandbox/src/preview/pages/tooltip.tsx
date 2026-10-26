import { useState } from "react";
import { Tooltip, TooltipProvider } from "@kit/components/tooltip";
import { Button } from "@kit/components/button";

export const meta = { title: "Tooltip" };

const Icon = ({ d }: { d: string }) => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export default function TooltipPage() {
  const [unnamed, setUnnamed] = useState(false);
  return (
    <TooltipProvider>
      <div>
        <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Tooltip</h1>
        <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
          Aparece sin demora al pasar el mouse o enfocar con Tab. Pasá de un botón a otro.
        </p>

        <section className="mb-10 flex flex-wrap items-center gap-4 pt-10" data-testid="tips">
          <Tooltip content="Editar">
            <Button iconOnly variant="secondary" aria-label="Editar" data-testid="tip-edit">
              <Icon d="M4 16l.8-3.2L13.5 4a1.4 1.4 0 012 2l-8.7 8.7z" />
            </Button>
          </Tooltip>
          <Tooltip content="Duplicar">
            <Button iconOnly variant="secondary" aria-label="Duplicar" data-testid="tip-copy">
              <Icon d="M7 7h9v9H7zM13 7V5.5A1.5 1.5 0 0011.5 4h-6A1.5 1.5 0 004 5.5v6A1.5 1.5 0 005.5 13H7" />
            </Button>
          </Tooltip>
          <Tooltip content="Eliminar definitivamente">
            <Button iconOnly variant="danger-ghost" aria-label="Eliminar" data-testid="tip-trash">
              <Icon d="M4.5 6h11M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6" />
            </Button>
          </Tooltip>
          <Tooltip content="Abajo" side="bottom">
            <Button variant="tertiary" data-testid="tip-bottom">
              Debajo
            </Button>
          </Tooltip>
          <Tooltip content="A la derecha" side="right">
            <Button variant="tertiary" data-testid="tip-right">
              Derecha
            </Button>
          </Tooltip>
        </section>

        <section className="mb-10">
          <h2 className="mb-1 text-lg font-semibold text-(--color-on-surface)">Disparador sin nombre</h2>
          <p className="mb-3 max-w-prose text-sm text-(--color-on-surface-variant)">
            Un tooltip describe, no nombra: un control solo con ícono necesita su propio aria-label. En desarrollo avisa por consola.
          </p>
          <Button variant="secondary" onClick={() => setUnnamed(true)} data-testid="tip-reveal-unnamed">
            Montar uno sin nombre
          </Button>
          {unnamed ? (
            <Tooltip content="Sin nombre">
              <button type="button" className="kit-focus ml-3 size-10 rounded-(--radius-control) bg-(--color-surface-container)" data-testid="tip-unnamed">
                <Icon d="M4 10h12" />
              </button>
            </Tooltip>
          ) : null}
        </section>
      </div>
    </TooltipProvider>
  );
}
