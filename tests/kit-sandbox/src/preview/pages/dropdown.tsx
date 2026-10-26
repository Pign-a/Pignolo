import { useState } from "react";
import { Dropdown, type DropdownOption } from "@kit/components/dropdown";

export const meta = { title: "Dropdown" };

const orden: DropdownOption[] = [
  { value: "recientes", label: "Más recientes" },
  { value: "antiguos", label: "Más antiguos" },
  { value: "mayor", label: "Mayor monto" },
  { value: "menor", label: "Menor monto" },
  { value: "alfabetico", label: "Alfabético" },
  { value: "categoria", label: "Por categoría" },
];

const paises: DropdownOption[] = [
  "Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "Costa Rica", "Cuba", "Ecuador", "El Salvador", "España", "Guatemala",
  "Honduras", "México", "Nicaragua", "Panamá", "Paraguay", "Perú", "Uruguay", "Venezuela",
].map((p) => ({ value: p.toLowerCase(), label: p }));

const categorias: DropdownOption[] = [
  { value: "hogar", label: "Hogar" },
  { value: "comida", label: "Comida" },
  { value: "transporte", label: "Transporte" },
  { value: "salud", label: "Salud", disabled: true },
  { value: "ocio", label: "Ocio" },
  { value: "otros", label: "Otros" },
];

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
      <h2 className="mb-3 text-sm font-semibold text-(--color-on-surface-variant)">{title}</h2>
      {children}
    </section>
  );
}

const plain =
  "kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container)";

export default function DropdownPage() {
  const [orderValue, setOrderValue] = useState("recientes");
  const [country, setCountry] = useState<string | undefined>(undefined);
  const [posted, setPosted] = useState("nada");
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Dropdown</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Reemplaza al select nativo. Flechas, letras para saltar, Enter para elegir, Esc para cerrar.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Cell title="Con valor y ayuda (dentro de un form)">
          <form data-testid="dd-order" className="max-w-xs" onSubmit={(e) => e.preventDefault()}>
            <Dropdown
              label="Ordenar por"
              options={orden}
              value={orderValue}
              onValueChange={setOrderValue}
              helperText="Cambia el orden de los movimientos."
              name="orden"
            />
          </form>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="dd-order-value">{orderValue}</span>
          </p>
        </Cell>
        <Cell title="Lista larga con scroll">
          <div data-testid="dd-country" className="max-w-xs">
            <Dropdown label="País" options={paises} value={country} onValueChange={setCountry} placeholder="Elegí un país" />
          </div>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Valor: <span data-testid="dd-country-value">{country ?? "ninguno"}</span>
          </p>
        </Cell>
        <Cell title="Opción deshabilitada">
          <div className="max-w-xs">
            <Dropdown label="Categoría" options={categorias} placeholder="Elegí una categoría" />
          </div>
        </Cell>
        <Cell title="Error">
          <div className="max-w-xs">
            <Dropdown label="Cuenta de destino" options={categorias} placeholder="Elegí una cuenta" error="Elegí una cuenta para continuar." required />
          </div>
        </Cell>
        <Cell title="Cargando">
          <div data-testid="dd-loading" className="max-w-xs">
            <Dropdown label="Moneda" options={[]} loading loadingLabel="Cargando monedas" placeholder="Elegí una moneda" />
          </div>
        </Cell>
        <Cell title="Sin opciones">
          <div data-testid="dd-empty" className="max-w-xs">
            <Dropdown label="Etiqueta" options={[]} emptyLabel="Todavía no hay etiquetas" placeholder="Elegí una etiqueta" />
          </div>
        </Cell>
        <Cell title="Deshabilitado">
          <div className="max-w-xs">
            <Dropdown label="Plan" options={orden} defaultValue="mayor" disabled helperText="Solo el administrador puede cambiarlo." />
          </div>
        </Cell>
        <Cell title="Solo lectura">
          <div data-testid="dd-readonly" className="max-w-xs">
            <Dropdown label="Moneda base" options={orden} defaultValue="antiguos" readOnly />
          </div>
        </Cell>
        <Cell title="Formulario con campo requerido y reset">
          <form
            data-testid="dd-form"
            className="flex max-w-xs flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setPosted(JSON.stringify(Object.fromEntries(new FormData(e.currentTarget))));
            }}
          >
            <Dropdown label="Rubro" name="rubro" options={categorias} placeholder="Elegí un rubro" required defaultValue="comida" />
            <Dropdown label="Prioridad" name="prioridad" options={orden} placeholder="Elegí una prioridad" required />
            <div className="flex gap-2">
              <button type="submit" data-testid="dd-submit" className={plain}>
                Enviar
              </button>
              <button type="reset" data-testid="dd-reset" className={plain}>
                Restablecer
              </button>
            </div>
          </form>
          <p className="mt-3 text-sm text-(--color-on-surface-muted)">
            Enviado: <span data-testid="dd-posted">{posted}</span>
          </p>
        </Cell>
      </div>
      <section className="mt-4 rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
        <h2 className="mb-3 text-sm font-semibold text-(--color-on-surface-variant)">Dentro de un contenedor con scroll</h2>
        <div data-testid="dd-box" className="kit-scroll h-56 overflow-y-auto rounded-(--radius-md) border border-(--color-border-subtle) p-3">
          <div className="h-24" />
          <div className="max-w-xs">
            <Dropdown label="Ciudad" options={orden} placeholder="Elegí una ciudad" />
          </div>
          <div className="h-96" />
        </div>
      </section>
      <p className="mt-6 text-sm text-(--color-on-surface-muted)">La página sigue más abajo para poder desplazarla con la lista abierta.</p>
      <div data-testid="dd-tail" className="h-[900px]" />
    </div>
  );
}
