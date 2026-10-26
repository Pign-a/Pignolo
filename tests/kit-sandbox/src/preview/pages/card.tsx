import { useState } from "react";
import { Card } from "@kit/components/card";

export const meta = { title: "Card" };

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold text-(--color-on-surface)">{title}</h2>
      {note ? <p className="mb-3 mt-1 max-w-prose text-sm text-(--color-on-surface-variant)">{note}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

export default function CardPage() {
  const [opened, setOpened] = useState(0);
  const [renewed, setRenewed] = useState(0);
  const [removed, setRemoved] = useState(0);
  const [busy, setBusy] = useState(false);

  const renew = () => {
    setRenewed((n) => n + 1);
    setBusy(true);
    window.setTimeout(() => setBusy(false), 1200);
  };

  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Card</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Un concepto, pocos datos y un solo paso siguiente. O toda la tarjeta es la acción, o lleva botones; nunca las dos.
      </p>

      <Section title="Toda la tarjeta es la acción" note="Pasá el mouse: aparece una sombra suave y la tarjeta no se mueve. Al presionar se achica apenas.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div data-testid="card-press-wrap">
            <Card
              onPress={() => setOpened((n) => n + 1)}
              title="Resumen del mes"
              description="Ingresos, gastos y ahorro del período en curso"
              facts={[
                { label: "Ingresos", value: "$ 482.300" },
                { label: "Ahorro", value: "18 %" },
              ]}
            />
          </div>
          <Card href="#/card" title="Metas" description="Vacaciones y fondo de emergencia" facts={[{ label: "Cumplido", value: "68 %" }, { label: "Faltan", value: "4 meses" }]} />
          <Card
            onPress={() => setOpened((n) => n + 1)}
            disabled
            title="Reportes anuales"
            description="Disponible cuando cierres el primer trimestre"
            facts={[{ label: "Estado", value: "Pendiente" }]}
          />
        </div>
        <p className="mt-2 text-sm text-(--color-on-surface-muted)">
          Aperturas: <span data-testid="opened">{opened}</span>
        </p>
      </Section>

      <Section title="Con acciones" note="Una primaria a la derecha, una secundaria discreta. La acción destructiva queda aparte, arriba.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card
            title="Plan Profesional"
            description="Facturación mensual con cinco usuarios incluidos"
            facts={[
              { label: "Precio", value: "$ 12.900" },
              { label: "Renueva", value: "4 nov" },
              { label: "Usuarios", value: "5 de 5" },
              { label: "Almacenamiento", value: "38 GB" },
            ]}
            primaryAction={{ label: "Renovar ahora", onPress: renew, loading: busy, loadingLabel: "Renovando" }}
            secondaryAction={{ label: "Ver factura", onPress: () => {} }}
            destructiveAction={{ label: "Cancelar plan", onPress: () => setRemoved((n) => n + 1) }}
          />
          <Card
            title="Proyecto Atlas"
            description="Rediseño del panel de clientes"
            facts={[
              { label: "Avance", value: "72 %" },
              { label: "Entrega", value: "12 dic" },
            ]}
            primaryAction={{ label: "Abrir proyecto", onPress: () => setOpened((n) => n + 1) }}
          />
        </div>
        <p className="mt-2 text-sm text-(--color-on-surface-muted)">
          Renovaciones: <span data-testid="renewed">{renewed}</span> · cancelaciones: <span data-testid="removed">{removed}</span>
        </p>
      </Section>

      <Section title="Cargando y deshabilitada" note="El esqueleto mantiene el tamaño; deshabilitada no reacciona al mouse.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card loading loadingLabel="Cargando plan" title="" />
          <Card
            disabled
            title="Plan Gratuito"
            description="Un usuario y 2 GB de espacio"
            facts={[{ label: "Precio", value: "$ 0" }]}
            primaryAction={{ label: "Mejorar plan", onPress: () => {} }}
            destructiveAction={{ label: "Quitar plan", onPress: () => {} }}
          />
        </div>
      </Section>
    </div>
  );
}
