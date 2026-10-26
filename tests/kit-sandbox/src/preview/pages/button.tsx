import { useState } from "react";
import { Button, type ButtonVariant } from "@kit/components/button";

export const meta = { title: "Button" };

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-(--color-on-surface)">{title}</h2>
      {note ? <p className="mb-3 mt-1 max-w-prose text-sm text-(--color-on-surface-variant)">{note}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

const PlusIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <path d="M10 4.5v11M4.5 10h11" />
  </svg>
);
const ArrowIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 4l6 6-6 6" />
  </svg>
);
const TrashIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.6 9.5h6.8L14 6" />
  </svg>
);

const variants: { v: ButtonVariant; label: string }[] = [
  { v: "primary", label: "Guardar cambios" },
  { v: "secondary", label: "Cancelar" },
  { v: "tertiary", label: "Ver detalle" },
  { v: "danger", label: "Eliminar cuenta" },
  { v: "danger-ghost", label: "Quitar" },
];

export default function ButtonPage() {
  const [saves, setSaves] = useState(0);
  const [clicks, setClicks] = useState(0);
  const [loading, setLoading] = useState(false);
  const [disabledClicks, setDisabledClicks] = useState(0);

  const save = () => {
    setSaves((n) => n + 1);
    setLoading(true);
    window.setTimeout(() => setLoading(false), 1500);
  };

  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Button</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Una acción primaria por área; el resto baja de jerarquía. Texto siempre verbo + objeto.
      </p>

      <Section title="Jerarquía" note="Primaria, secundaria, terciaria, peligro y peligro discreto.">
        <div className="flex flex-wrap items-center gap-4">
          {variants.map(({ v, label }) => (
            <Button key={v} variant={v} data-testid={`btn-${v}`}>
              {label}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Par de diálogo" note="Primaria a la derecha, secundaria a su izquierda.">
        <div className="flex justify-end gap-4 rounded-(--radius-lg) border border-(--color-border-subtle) p-4">
          <Button variant="secondary">Cancelar</Button>
          <Button data-testid="btn-save" onClick={() => setSaves((n) => n + 1)}>
            Guardar cambios
          </Button>
        </div>
        <p className="mt-2 text-sm text-(--color-on-surface-muted)">
          Guardados: <span data-testid="saves">{saves}</span>
        </p>
      </Section>

      <Section title="Tamaños" note="32, 40 y 48 px de alto. 40 es el predeterminado.">
        <div className="flex flex-wrap items-center gap-4">
          <Button size="sm" data-testid="btn-sm">Pequeño</Button>
          <Button size="md" data-testid="btn-md">Mediano</Button>
          <Button size="lg" data-testid="btn-lg">Grande</Button>
        </div>
      </Section>

      <Section title="Con icono" note="El icono acompaña al texto; nunca lo reemplaza sin nombre accesible.">
        <div className="flex flex-wrap items-center gap-4">
          <Button leadingIcon={<PlusIcon />}>Nuevo proyecto</Button>
          <Button variant="secondary" trailingIcon={<ArrowIcon />}>Continuar</Button>
          <Button variant="tertiary" leadingIcon={<PlusIcon />}>Agregar cliente</Button>
        </div>
      </Section>

      <Section title="Solo icono" note="Lleva aria-label obligatorio por tipo.">
        <div className="flex flex-wrap items-center gap-4">
          <Button iconOnly aria-label="Agregar" data-testid="btn-icon">
            <PlusIcon />
          </Button>
          <Button iconOnly variant="secondary" aria-label="Siguiente">
            <ArrowIcon />
          </Button>
          <Button iconOnly variant="danger-ghost" size="sm" aria-label="Eliminar">
            <TrashIcon />
          </Button>
          <Button iconOnly variant="tertiary" size="lg" aria-label="Agregar otro">
            <PlusIcon />
          </Button>
        </div>
      </Section>

      <Section title="Cargando" note="El spinner reemplaza al icono, el texto se queda y el ancho no cambia. Sigue enfocable.">
        <div className="flex flex-wrap items-center gap-4">
          <Button data-testid="btn-load" loading={loading} loadingLabel="Guardando" onClick={save}>
            Guardar cambios
          </Button>
          <Button variant="secondary" loading leadingIcon={<PlusIcon />} loadingLabel="Creando">
            Crear proyecto
          </Button>
          <Button iconOnly variant="secondary" loading aria-label="Cargando">
            <PlusIcon />
          </Button>
        </div>
        <p className="mt-2 text-sm text-(--color-on-surface-muted)">
          Envíos: <span data-testid="saves-load">{saves}</span>
        </p>
      </Section>

      <Section title="Deshabilitado y contador" note="Solo para el caso en que no haya forma de explicarlo con validación.">
        <div className="flex flex-wrap items-center gap-4">
          <Button disabled data-testid="btn-disabled" onClick={() => setDisabledClicks((n) => n + 1)}>
            Enviar
          </Button>
          <Button variant="secondary" disabled>
            Descargar
          </Button>
          <Button data-testid="btn-count" onClick={() => setClicks((n) => n + 1)}>
            Sumar uno
          </Button>
          <span className="text-sm text-(--color-on-surface-muted)">
            Clics: <span data-testid="clicks">{clicks}</span> · bloqueados: <span data-testid="blocked">{disabledClicks}</span>
          </span>
        </div>
      </Section>
    </div>
  );
}
