import { useState } from "react";
import { Switch } from "@kit/components/switch";

export const meta = { title: "Switch" };

export default function SwitchPage() {
  const [notif, setNotif] = useState(true);
  const [plane, setPlane] = useState(false);
  const [sync, setSync] = useState(true);
  const [rtl, setRtl] = useState(false);
  const [changes, setChanges] = useState(0);
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Switch</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Una opción que se aplica al instante. Mantené apretado para ver cómo el círculo se estira y arrastralo de lado a lado, como en el iPhone: al soltar queda del lado más cercano, o del lado hacia el que lo lanzaste.
      </p>

      <section className="mb-10 max-w-md divide-y divide-(--color-border-subtle) rounded-(--radius-lg) border border-(--color-border-subtle) px-5">
        <Switch label="Notificaciones" description="Avisos de vencimientos y pagos" checked={notif} onCheckedChange={setNotif} data-testid="sw-notif" />
        <Switch label="Modo avión" checked={plane} onCheckedChange={setPlane} data-testid="sw-plane" />
        <Switch label="Sincronizar con el banco" description="Se actualiza una vez por día" checked={sync} onCheckedChange={setSync} data-testid="sw-sync" />
        <Switch label="Reportes mensuales" defaultChecked disabled data-testid="sw-disabled-on" />
        <Switch label="Compartir ubicación" disabled data-testid="sw-disabled-off" />
      </section>

      <p className="text-sm text-(--color-on-surface-muted)">
        Estado: <span data-testid="state">{[notif, plane, sync].map((v) => (v ? "1" : "0")).join("")}</span>
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-(--color-on-surface)">Arrastre</h2>
      <div className="flex items-center gap-6">
        <Switch aria-label="Arrastrar para activar" onCheckedChange={() => setChanges((n) => n + 1)} data-testid="sw-drag" />
        <p className="text-sm text-(--color-on-surface-muted)">
          Cambios de estado: <span data-testid="drag-count">{changes}</span>
        </p>
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-(--color-on-surface)">De derecha a izquierda</h2>
      <div dir="rtl" className="max-w-md rounded-(--radius-lg) border border-(--color-border-subtle) px-5">
        <Switch label="الإشعارات" checked={rtl} onCheckedChange={setRtl} data-testid="sw-rtl" />
      </div>

      <h2 className="mb-2 mt-8 text-lg font-semibold text-(--color-on-surface)">Sin texto visible</h2>
      <div className="flex items-center gap-3">
        <Switch aria-label="Activar modo oscuro" data-testid="sw-bare" />
        <span className="text-sm text-(--color-on-surface-variant)">Modo oscuro</span>
      </div>
    </div>
  );
}
