import { useState } from "react";
import { RollingNumber } from "@kit/components/rolling-number";

export const meta = { title: "Rolling number" };

const ars = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
const km = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("es-AR", { style: "percent", minimumFractionDigits: 1 });
const plain = new Intl.NumberFormat("es-AR");
const fixed2 = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const free = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

/** A figure with a low and a high value, to watch it gain and lose characters. */
function Pair({ id, title, low, high, format }: { id: string; title: string; low: number; high: number; format: (n: number) => string }) {
  const [v, setV] = useState(low);
  return (
    <div className="rounded-(--radius-lg) border border-(--color-border-subtle) p-4">
      <h3 className="mb-1 text-sm text-(--color-on-surface-variant)">{title}</h3>
      <p className="mb-3 text-3xl font-semibold text-(--color-on-surface)" data-testid={`rn-${id}`}>
        <RollingNumber value={v} format={format} />
      </p>
      <div className="flex gap-2">
        <button type="button" className={btn} data-testid={`rn-${id}-hi`} onClick={() => setV(high)}>
          {format(high)}
        </button>
        <button type="button" className={btn} data-testid={`rn-${id}-lo`} onClick={() => setV(low)}>
          {format(low)}
        </button>
      </div>
    </div>
  );
}

const btn =
  "kit-focus min-h-(--target-recommended) rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container) active:bg-(--color-surface-container)";

export default function RollingNumberPage() {
  const [money, setMoney] = useState(1284560);
  const [distance, setDistance] = useState(42.7);
  const [share, setShare] = useState(0.184);
  const [mounted, setMounted] = useState(false);
  const [auto, setAuto] = useState(48210);

  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Rolling number</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Cada dígito rueda al nuevo valor con el nivel de datos (0,45 s, sin rebote), de a uno cada 50 ms y como mucho 0,2 s entre el primero y el último. Solo rueda cuando el valor cambia después de aparecer; una actualización automática puede pedir que no ruede. El formato lo decide quien lo usa.
      </p>

      <section className="mb-10 rounded-(--radius-lg) border border-(--color-border-subtle) p-6">
        <h2 className="mb-1 text-sm text-(--color-on-surface-variant)">Ingresos del mes (pesos)</h2>
        <p className="mb-4 text-4xl font-semibold tracking-tight text-(--color-on-surface)" data-testid="rn-money">
          <RollingNumber value={money} label="Ingresos del mes" format={(n) => ars.format(n)} />
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} data-testid="rn-a" onClick={() => setMoney(1397425)}>
            Cambiar a 1.397.425
          </button>
          <button type="button" className={btn} data-testid="rn-b" onClick={() => setMoney(98700)}>
            Cambiar a 98.700
          </button>
          <button type="button" className={btn} data-testid="rn-c" onClick={() => setMoney(12840560)}>
            Cambiar a 12.840.560
          </button>
          <button type="button" className={btn} data-testid="rn-plus" onClick={() => setMoney((v) => v + 1)}>
            Sumar 1
          </button>
        </div>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Más o menos dígitos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Pair id="grow" title="99 y 100" low={99} high={100} format={(n) => plain.format(n)} />
          <Pair id="thousand" title="999 y 1.000 (separador de miles)" low={999} high={1000} format={(n) => plain.format(n)} />
          <Pair id="dec" title="9,99 y 10,00 (dos decimales fijos)" low={9.99} high={10} format={(n) => fixed2.format(n)} />
          <Pair id="usd" title="Dólares: $9.99 y $10.00" low={9.99} high={10} format={(n) => usd.format(n)} />
          <Pair id="ars" title="Pesos: $ 99 y $ 100" low={99} high={100} format={(n) => ars.format(n)} />
          <Pair id="free" title="1.234 y 1.234,5 (aparece el decimal)" low={1234} high={1234.5} format={(n) => free.format(n)} />
        </div>
      </section>

      <section className="mb-10 grid gap-4 sm:grid-cols-2">
        <div className="rounded-(--radius-lg) border border-(--color-border-subtle) p-6">
          <h2 className="mb-1 text-sm text-(--color-on-surface-variant)">Distancia recorrida</h2>
          <p className="mb-4 text-3xl font-semibold text-(--color-on-surface)" data-testid="rn-km">
            <RollingNumber value={distance} format={(n) => `${km.format(n)} km`} />
          </p>
          <button type="button" className={btn} onClick={() => setDistance((v) => Math.round((v + 17.3) * 10) / 10)}>
            Sumar 17,3 km
          </button>
        </div>
        <div className="rounded-(--radius-lg) border border-(--color-border-subtle) p-6">
          <h2 className="mb-1 text-sm text-(--color-on-surface-variant)">Participación</h2>
          <p className="mb-4 text-3xl font-semibold text-(--color-on-surface)" data-testid="rn-pct">
            <RollingNumber value={share} format={(n) => pct.format(n)} />
          </p>
          <button type="button" className={btn} onClick={() => setShare((v) => (v > 0.9 ? 0.05 : Math.round((v + 0.137) * 1000) / 1000))}>
            Cambiar participación
          </button>
        </div>
      </section>

      <section className="mb-10 rounded-(--radius-lg) border border-(--color-border-subtle) p-6">
        <h2 className="mb-1 text-sm text-(--color-on-surface-variant)">Actualización automática (sin rodar)</h2>
        <p className="mb-4 text-3xl font-semibold text-(--color-on-surface)" data-testid="rn-auto">
          <RollingNumber value={auto} instant label="Visitas ahora" />
        </p>
        <button type="button" className={btn} data-testid="rn-auto-btn" onClick={() => setAuto((v) => v + 12345)}>
          Llegó una actualización
        </button>
      </section>

      <section className="rounded-(--radius-lg) border border-(--color-border-subtle) p-6">
        <h2 className="mb-1 text-sm text-(--color-on-surface-variant)">Entra rodando desde cero</h2>
        <p className="mb-4 text-3xl font-semibold text-(--color-on-surface)" data-testid="rn-mount">
          {mounted ? <RollingNumber value={64210} animateOnMount format={(n) => ars.format(n)} /> : "Sin mostrar"}
        </p>
        <button type="button" className={btn} data-testid="rn-mount-btn" onClick={() => setMounted((v) => !v)}>
          {mounted ? "Ocultar" : "Mostrar"}
        </button>
      </section>
    </div>
  );
}
