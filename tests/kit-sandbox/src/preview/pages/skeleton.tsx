import { useState } from "react";
import { Skeleton, SkeletonRegion, SkeletonSwap, SkeletonText, useReveal } from "@kit/components/skeleton";

export const meta = { title: "Skeleton" };

const btn =
  "kit-focus min-h-(--target-recommended) rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container) active:bg-(--color-surface-container)";

const rows = [
  { name: "Alquiler de oficina", amount: "$ 480.000" },
  { name: "Servicio de internet", amount: "$ 32.500" },
  { name: "Seguro del auto", amount: "$ 58.900" },
];

/** One module that swaps its skeleton for content, with the arrival decided by useReveal. */
function ArrivalModule() {
  const [loading, setLoading] = useState(true);
  const arrival = useReveal(!loading);
  return (
    <div>
      <button type="button" className={`${btn} mb-3`} data-testid="sk-arrive-toggle" onClick={() => setLoading((v) => !v)}>
        {loading ? "Terminó de cargar" : "Volver a cargar"}
      </button>
      <div className="relative max-w-sm rounded-(--radius-lg) border border-(--color-border-subtle) p-6" data-testid="sk-arrive">
        <SkeletonSwap swapKey={loading ? "loading" : "ready"} animated={arrival !== "none"}>
          {loading ? (
            <SkeletonRegion label="Cargando resumen" delayMs={0}>
              <Skeleton radius="sm" className="h-3.5 w-28" />
              <Skeleton className="mt-3 h-10 w-44" delay={0.1} />
            </SkeletonRegion>
          ) : (
            <>
              <p className="h-3.5 text-sm leading-[14px] text-(--color-on-surface-variant)">Resumen del mes</p>
              <p data-testid="sk-arrive-figure" className="mt-3 h-10 text-4xl leading-10 font-semibold tracking-tight text-(--color-on-surface)">$ 482.300</p>
            </>
          )}
        </SkeletonSwap>
      </div>
    </div>
  );
}

export default function SkeletonPage() {
  const [loading, setLoading] = useState(true);
  const [waiting, setWaiting] = useState(false);
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Skeleton</h1>
      <p className="mb-6 max-w-prose text-(--color-on-surface-variant)">
        Formas del tamaño final con un brillo que cruza. Con movimiento reducido quedan quietas. Una carga de menos de un segundo no muestra nada: la región espera 1 s antes de dibujar las formas (acá las primeras secciones piden 0 para mostrarlas siempre). Para un solo módulo chico, mejor un spinner.
      </p>
      <button type="button" className={`${btn} mb-8`} data-testid="sk-toggle" aria-pressed={loading} onClick={() => setLoading((v) => !v)}>
        {loading ? "Mostrar contenido" : "Volver a cargar"}
      </button>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Tarjeta de cifra</h2>
        <div className="max-w-sm rounded-(--radius-lg) border border-(--color-border-subtle) p-6" data-testid="sk-card">
          {loading ? (
            <SkeletonRegion label="Cargando ingresos del mes" delayMs={0}>
              <Skeleton radius="sm" className="h-3.5 w-28" />
              <Skeleton className="mt-3 h-10 w-44" delay={0.1} />
              <Skeleton radius="sm" className="mt-4 h-3.5 w-36" delay={0.2} />
            </SkeletonRegion>
          ) : (
            <>
              <p className="text-sm text-(--color-on-surface-variant)">Ingresos del mes</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight text-(--color-on-surface)">$ 1.284.560</p>
              <p className="mt-3 text-sm text-(--color-on-surface-muted)">Actualizado hace 2 horas</p>
            </>
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Filas de lista</h2>
        <div className="max-w-md" data-testid="sk-rows">
          {loading ? (
            <SkeletonRegion label="Cargando gastos" className="flex flex-col gap-2" delayMs={0}>
              {rows.map((r, i) => (
                <Skeleton key={r.name} className="h-12" radius="lg" delay={i * 0.1} />
              ))}
            </SkeletonRegion>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {rows.map((r) => (
                <li
                  key={r.name}
                  className="flex h-12 items-center justify-between rounded-(--radius-lg) border border-(--color-border-subtle) px-4 text-sm text-(--color-on-surface)"
                >
                  <span>{r.name}</span>
                  <span className="tabular-nums">{r.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Llegada del contenido</h2>
        <p className="mb-3 max-w-prose text-sm text-(--color-on-surface-variant)">
          La primera vez que el contenido reemplaza al esqueleto, se funde con él; al volver a cargar algo que ya se veía, aparece sin animación.
        </p>
        <ArrivalModule />
      </section>

      <section className="mb-10" data-testid="sk-delay">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Con espera (la región por defecto)</h2>
        <div className="mb-3 flex gap-2">
          <button type="button" className={btn} data-testid="sk-delay-start" onClick={() => setWaiting(true)}>
            Empezar a cargar
          </button>
          <button type="button" className={btn} data-testid="sk-delay-stop" onClick={() => setWaiting(false)}>
            Terminó de cargar
          </button>
        </div>
        <div className="max-w-md rounded-(--radius-lg) border border-(--color-border-subtle) p-4" data-testid="sk-delay-box">
          {waiting ? (
            <SkeletonRegion label="Cargando movimientos">
              <Skeleton className="h-6 w-48" />
              <Skeleton radius="sm" className="mt-3 h-3.5 w-64" delay={0.1} />
            </SkeletonRegion>
          ) : (
            <>
              <p className="h-6 text-base text-(--color-on-surface)">Movimientos del mes</p>
              <p className="mt-3 h-3.5 text-sm leading-[14px] text-(--color-on-surface-muted)">Listo, nada que cargar.</p>
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Texto</h2>
        <div className="max-w-md" data-testid="sk-text">
          {loading ? (
            <SkeletonRegion label="Cargando descripción" delayMs={0}>
              <SkeletonText lines={4} />
            </SkeletonRegion>
          ) : (
            <p className="text-sm text-(--color-on-surface-variant)">
              El informe junta los ingresos confirmados del período y resta los gastos ya pagados. Los pendientes se
              muestran aparte hasta que se confirmen.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
