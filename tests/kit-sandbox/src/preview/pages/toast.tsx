import { useRef, useState } from "react";
import { ToastProvider, useToast } from "@kit/components/toast";

export const meta = { title: "Toast" };

const buttonClass =
  "kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container) active:bg-(--color-border-subtle)";

function Demo() {
  const { toast, update, dismiss } = useToast();
  const [log, setLog] = useState("ninguna");
  const n = useRef(0);

  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Toast</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Avisos apilados. Al cerrar uno del medio, los demás se reubican. Pasar el mouse o el foco por encima detiene el temporizador.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="add"
          className={buttonClass}
          onClick={() => toast({ title: `Cambios guardados ${++n.current}`, variant: "success", duration: 60000 })}
        >
          Mostrar aviso
        </button>
        <button
          type="button"
          data-testid="add-short"
          className={buttonClass}
          onClick={() => toast({ title: "Informe exportado", description: "Está en tu carpeta de descargas.", variant: "info", duration: 1500 })}
        >
          Aviso breve
        </button>
        <button
          type="button"
          data-testid="add-undo"
          className={buttonClass}
          onClick={() =>
            toast({
              title: "Gasto eliminado",
              duration: 60000,
              action: { label: "Deshacer", onClick: () => setLog("deshecho") },
            })
          }
        >
          Eliminar con deshacer
        </button>
        <button
          type="button"
          data-testid="add-undo-default"
          className={buttonClass}
          onClick={() => toast({ title: "Gasto eliminado", action: { label: "Deshacer", onClick: () => setLog("deshecho") } })}
        >
          Deshacer sin duración
        </button>
        <button
          type="button"
          data-testid="add-undo-short"
          className={buttonClass}
          onClick={() => toast({ title: "Movimiento eliminado", duration: 1500, action: { label: "Deshacer", onClick: () => setLog("deshecho-corto") } })}
        >
          Deshacer con 1,5 s
        </button>
        <button
          type="button"
          data-testid="add-error"
          className={buttonClass}
          onClick={() => toast({ title: "No se pudo sincronizar", description: "Revisá tu conexión e intentá de nuevo.", variant: "error" })}
        >
          Error persistente
        </button>
        <button
          type="button"
          data-testid="add-warning"
          className={buttonClass}
          onClick={() => toast({ title: "Tu plan vence en 3 días", variant: "warning" })}
        >
          Advertencia
        </button>
        <button
          type="button"
          data-testid="add-loading"
          className={buttonClass}
          onClick={() => {
            const id = toast({ title: "Guardando informe", variant: "loading" });
            window.setTimeout(() => update(id, { title: "Informe guardado", variant: "success", duration: 60000 }), 1200);
          }}
        >
          Guardar con espera
        </button>
        <button type="button" data-testid="clear" className={buttonClass} onClick={() => dismiss()}>
          Cerrar todos
        </button>
      </div>
      <p className="mt-6 text-sm text-(--color-on-surface-muted)">
        Última acción: <span data-testid="log">{log}</span>
      </p>
    </div>
  );
}

export default function ToastPage() {
  return (
    <ToastProvider closeLabel="Cerrar aviso" regionLabel="Avisos" max={4}>
      <Demo />
    </ToastProvider>
  );
}
