import { useState } from "react";
import { TextField } from "@kit/components/text-field";
import { ConfirmModal, Modal, ModalButton, ResponsiveDialog } from "@kit/components/modal";

export const meta = { title: "Modal" };

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-(--radius-lg) border border-(--color-border-subtle) bg-(--color-surface) p-4">
      <h2 className="mb-3 text-sm font-semibold text-(--color-on-surface-variant)">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export default function ModalPage() {
  const [form, setForm] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [destroy, setDestroy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const [name, setName] = useState("");
  const [log, setLog] = useState("ninguna");
  const [failed, setFailed] = useState(false);
  const [responsive, setResponsive] = useState(false);
  const [lockedResponsive, setLockedResponsive] = useState(false);

  const saveSlow = () => {
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setSlow(false);
      setLog("guardado");
    }, 1200);
  };

  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Modal</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Diálogo con fondo. Esc, la X y tocar el fondo lo cierran; el foco queda dentro y vuelve al botón que lo abrió.
      </p>
      <div className="grid gap-4">
        <Row title="Formulario corto">
          <button
            type="button"
            data-testid="open-form"
            onClick={() => setForm(true)}
            className="kit-focus min-h-10 rounded-(--radius-control) bg-(--color-primary) px-4 text-sm font-medium text-(--color-on-primary) hover:bg-(--color-primary-hover) active:bg-(--color-primary-pressed)"
          >
            Nuevo proyecto
          </button>
        </Row>
        <Row title="Confirmación simple">
          <button
            type="button"
            data-testid="open-confirm"
            onClick={() => setConfirm(true)}
            className="kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container)"
          >
            Archivar informe
          </button>
        </Row>
        <Row title="Confirmación destructiva">
          <button
            type="button"
            data-testid="open-destroy"
            onClick={() => setDestroy(true)}
            className="kit-focus min-h-10 rounded-(--radius-control) border border-(--color-error) px-4 text-sm font-medium text-(--color-error) hover:bg-(--color-error-container)"
          >
            Eliminar proyecto
          </button>
        </Row>
        <Row title="Guardando (el modal queda abierto)">
          <button
            type="button"
            data-testid="open-slow"
            onClick={() => setSlow(true)}
            className="kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container)"
          >
            Guardar con espera
          </button>
        </Row>
        <Row title="Con error y sin cierre accidental">
          <button
            type="button"
            data-testid="open-locked"
            onClick={() => {
              setLocked(true);
              setFailed(true);
            }}
            className="kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container)"
          >
            Editar con cambios
          </button>
        </Row>
        <Row title="Responsive: hoja abajo de 640 px o en celular, modal arriba">
          <button
            type="button"
            data-testid="open-responsive"
            onClick={() => setResponsive(true)}
            className="kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container)"
          >
            Compartir informe
          </button>
          <button
            type="button"
            data-testid="open-responsive-locked"
            onClick={() => setLockedResponsive(true)}
            className="kit-focus min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container)"
          >
            Responsive con cambios
          </button>
        </Row>
        <p className="text-sm text-(--color-on-surface-muted)">
          Última acción: <span data-testid="log">{log}</span>
        </p>
      </div>

      <Modal
        open={form}
        onOpenChange={setForm}
        title="Nuevo proyecto"
        description="Ponele un nombre. Después podés cambiarlo cuando quieras."
        closeLabel="Cerrar"
        footer={
          <>
            <ModalButton onClick={() => setForm(false)}>Cancelar</ModalButton>
            <ModalButton
              variant="primary"
              data-testid="form-save"
              onClick={() => {
                setLog(`proyecto ${name || "sin nombre"}`);
                setForm(false);
              }}
            >
              Crear proyecto
            </ModalButton>
          </>
        }
      >
        <TextField data-testid="form-name" label="Nombre" helperText="Hasta 40 caracteres." value={name} onChange={(e) => setName(e.target.value)} />
      </Modal>

      <ConfirmModal
        open={confirm}
        onOpenChange={setConfirm}
        title="Archivar informe"
        description="Podés recuperarlo desde Archivados cuando quieras."
        confirmLabel="Archivar informe"
        cancelLabel="Cancelar"
        closeLabel="Cerrar"
        onConfirm={() => {
          setLog("archivado");
          setConfirm(false);
        }}
      />

      <ConfirmModal
        open={destroy}
        onOpenChange={setDestroy}
        title="Eliminar proyecto"
        description="Se pierden sus 24 movimientos. No se puede deshacer."
        confirmLabel="Eliminar proyecto"
        cancelLabel="Conservar proyecto"
        closeLabel="Cerrar"
        destructive
        onConfirm={() => {
          setLog("eliminado");
          setDestroy(false);
        }}
      />

      <ConfirmModal
        open={slow}
        onOpenChange={(o) => !loading && setSlow(o)}
        title="Guardar cambios"
        description="Esto puede tardar unos segundos."
        confirmLabel="Guardar cambios"
        cancelLabel="Cancelar"
        closeLabel="Cerrar"
        loading={loading}
        onConfirm={saveSlow}
      />

      <ResponsiveDialog
        open={responsive}
        onOpenChange={setResponsive}
        title="Compartir informe"
        description="Elegí con quién lo compartís."
        closeLabel="Cerrar"
        footer={
          <>
            <ModalButton onClick={() => setResponsive(false)}>Cancelar</ModalButton>
            <ModalButton
              variant="primary"
              data-testid="responsive-share"
              onClick={() => {
                setLog("compartido");
                setResponsive(false);
              }}
            >
              Compartir
            </ModalButton>
          </>
        }
      >
        <p className="text-sm text-(--color-on-surface-variant)">Informe de octubre, 24 movimientos.</p>
      </ResponsiveDialog>

      <ResponsiveDialog
        open={lockedResponsive}
        onOpenChange={setLockedResponsive}
        title="Editar con cambios"
        description="Esc y el fondo no cierran este diálogo."
        closeLabel="Cerrar"
        preventDismiss
        footer={<ModalButton onClick={() => setLockedResponsive(false)}>Descartar</ModalButton>}
      >
        <p className="text-sm text-(--color-on-surface-variant)">Cambios sin guardar.</p>
      </ResponsiveDialog>

      <Modal
        open={locked}
        onOpenChange={setLocked}
        title="Editar movimiento"
        description="Hay cambios sin guardar. Esc y el fondo no cierran este diálogo."
        closeLabel="Cerrar"
        preventDismiss
        error={failed ? "No pudimos guardar. Tus cambios siguen acá." : undefined}
        footer={
          <>
            <ModalButton onClick={() => setLocked(false)}>Descartar</ModalButton>
            <ModalButton variant="primary" onClick={() => setFailed(true)}>
              Guardar
            </ModalButton>
          </>
        }
      >
        <p className="text-sm text-(--color-on-surface-variant)">Alquiler de octubre, $ 482.300.</p>
      </Modal>
    </div>
  );
}
