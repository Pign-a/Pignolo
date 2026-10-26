import { useState } from "react";
import { StatCard } from "@kit/components/stat-card";
import type { RevealMode } from "@kit/components/skeleton";

export const meta = { title: "Stat card" };

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const fmt = (n: number) => ars.format(n);

const btn =
  "kit-focus min-h-(--target-recommended) rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container) active:bg-(--color-surface-container)";

/** A figure that starts loading, so the way it arrives can be watched. */
function Arrival({ id, title, reveal }: { id: string; title: string; reveal: RevealMode }) {
  const [loading, setLoading] = useState(true);
  return (
    <div data-testid={`sc-arrive-${id}`}>
      <h3 className="mb-2 text-sm text-(--color-on-surface-variant)">{title}</h3>
      <button type="button" className={`${btn} mb-3`} data-testid={`sc-arrive-${id}-toggle`} onClick={() => setLoading((v) => !v)}>
        {loading ? "Terminó de cargar" : "Volver a cargar"}
      </button>
      <StatCard
        label="Ingresos del mes"
        value={loading ? null : 1284560}
        format={fmt}
        loading={loading}
        loadingLabel="Cargando ingresos del mes"
        skeletonDelayMs={0}
        reveal={reveal}
        trend={{ direction: "up", label: "Sube 8 % frente a septiembre" }}
        helper="Actualizado hace 2 horas"
      />
    </div>
  );
}

export default function StatCardPage() {
  const [income, setIncome] = useState(1284560);
  const [expenses, setExpenses] = useState(742300);
  const [failed, setFailed] = useState(true);
  const [clicks, setClicks] = useState(0);
  const [reloading, setReloading] = useState(false);

  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Stat card</h1>
      <p className="mb-6 max-w-prose text-(--color-on-surface-variant)">
        Una cifra, qué mide, hacia dónde va y una nota. La tendencia dice la dirección con palabras y con una flecha.
      </p>
      <div className="mb-8 flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          data-testid="sc-update"
          onClick={() => {
            setIncome((v) => (v === 1284560 ? 1397425 : 1284560));
            setExpenses((v) => (v === 742300 ? 698150 : 742300));
          }}
        >
          Actualizar cifras
        </button>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Franja de indicadores</h2>
        <div className="grid gap-4 md:grid-cols-3" data-testid="sc-band">
          <StatCard
            label="Ingresos del mes"
            value={income}
            format={fmt}
            trend={{ direction: "up", label: "Sube 8 % frente a septiembre" }}
            helper="Actualizado hace 2 horas"
          />
          <StatCard
            label="Gastos del mes"
            value={expenses}
            format={fmt}
            trend={{ direction: "down", label: "Baja 3 % frente a septiembre", upIsGood: false }}
            helper="Incluye gastos pendientes"
          />
          <StatCard
            label="Tareas abiertas"
            value={12}
            trend={{ direction: "flat", label: "Sin cambios desde ayer" }}
          />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Mala noticia: sube un gasto</h2>
        <div className="max-w-sm" data-testid="sc-bad">
          <StatCard
            label="Gastos del mes"
            value={812000}
            format={fmt}
            trend={{ direction: "up", label: "Sube 9 % frente a septiembre", upIsGood: false }}
          />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Estados</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div data-testid="sc-loading">
            <StatCard label="Ingresos del mes" value={null} loading loadingLabel="Cargando ingresos del mes" skeletonDelayMs={0} />
          </div>
          <div data-testid="sc-empty">
            <StatCard label="Ventas del mes" value={null} emptyText="Todavía no hay ventas este mes" />
          </div>
          <div data-testid="sc-error">
            {failed ? (
              <StatCard
                label="Saldo disponible"
                value={null}
                error={{
                  message: "No se pudo cargar el saldo.",
                  retryLabel: "Reintentar",
                  onRetry: () => setFailed(false),
                }}
              />
            ) : (
              <StatCard label="Saldo disponible" value={352800} format={fmt} animateOnMount helper="Reintento exitoso" />
            )}
          </div>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Cómo llega la cifra</h2>
        <p className="mb-4 max-w-prose text-sm text-(--color-on-surface-variant)">
          Automático: la primera vez que la cifra reemplaza a la espera se funde y rueda desde cero; al recargar algo que ya se veía, aparece sin animación.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Arrival id="auto" title="Automático (reveal auto)" reveal="auto" />
          <Arrival id="fade" title="Solo fundido (reveal fade)" reveal="fade" />
          <Arrival id="none" title="Sin animación (reveal none)" reveal="none" />
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Carga con espera (por defecto 1 s)</h2>
        <button type="button" className={`${btn} mb-3`} data-testid="sc-reload" onClick={() => setReloading((v) => !v)}>
          {reloading ? "Terminó de cargar" : "Empezar a cargar"}
        </button>
        <div className="max-w-sm" data-testid="sc-delay">
          <StatCard label="Ingresos del mes" value={reloading ? null : income} format={fmt} loading={reloading} loadingLabel="Cargando ingresos del mes" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Toda la tarjeta es un botón</h2>
        <div className="max-w-sm" data-testid="sc-click">
          <StatCard
            label="Facturas por cobrar"
            value={7}
            trend={{ direction: "up", label: "Sube 2 frente a la semana pasada", upIsGood: false }}
            helper="Tocá para ver el detalle"
            onClick={() => setClicks((c) => c + 1)}
          />
        </div>
        <p className="mt-3 text-sm text-(--color-on-surface-muted)" data-testid="sc-clicks">
          Aperturas: {clicks}
        </p>
      </section>
    </div>
  );
}
