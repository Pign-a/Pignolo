import { useState } from "react";
import { Progress, Steps } from "@kit/components/progress";
import { Button } from "@kit/components/button";

export const meta = { title: "Progress" };

const steps = [
  { id: "cuenta", label: "Cuenta" },
  { id: "datos", label: "Tus datos" },
  { id: "plan", label: "Elegir plan" },
  { id: "pago", label: "Pago" },
];

export default function ProgressPage() {
  const [value, setValue] = useState(35);
  const [step, setStep] = useState(1);
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Progress</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Barra con valor conocido o indeterminada, y pasos de un flujo corto.
      </p>

      <section className="mb-10 max-w-lg space-y-8">
        <div data-testid="bar-main">
          <Progress label="Importando movimientos" valueText={`${value} %`} value={value} getValueLabel={(v, max) => `${v} de ${max} por ciento`} />
          <div className="mt-3 flex gap-3">
            <Button size="sm" variant="secondary" onClick={() => setValue((v) => Math.max(0, v - 25))} data-testid="bar-minus">
              Menos
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setValue((v) => Math.min(100, v + 25))} data-testid="bar-plus">
              Más
            </Button>
          </div>
        </div>
        <div data-testid="bar-indeterminate">
          <Progress label="Buscando actualizaciones" value={null} />
        </div>
        <div data-testid="bar-small">
          <Progress aria-label="Espacio usado" size="sm" value={82} />
        </div>
        <p className="text-sm text-(--color-on-surface-muted)">Bajá: la barra siguiente empieza a crecer recién cuando aparece en pantalla.</p>
        <div aria-hidden="true" className="h-[560px]" />
        <div data-testid="bar-done">
          <Progress label="Copia de seguridad" valueText="Completa" value={100} />
        </div>
      </section>

      <section className="mb-10 max-w-xl" data-testid="steps">
        <h2 className="mb-4 text-lg font-semibold text-(--color-on-surface)">Pasos</h2>
        <Steps
          steps={steps}
          current={step}
          ariaLabel="Alta de cuenta"
          statusLabels={{ complete: "Completado", current: "Paso actual", upcoming: "Pendiente" }}
        />
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="sm" variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} data-testid="step-back">
            Anterior
          </Button>
          <Button size="sm" onClick={() => setStep((s) => Math.min(steps.length, s + 1))} data-testid="step-next">
            Siguiente
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => setStep(steps.length)} data-testid="step-end">
            Terminar todo
          </Button>
          <Button size="sm" variant="tertiary" onClick={() => setStep(0)} data-testid="step-reset">
            Reiniciar
          </Button>
        </div>
        <p className="mt-3 text-sm text-(--color-on-surface-muted)">
          Paso: <span data-testid="step">{step}</span>
        </p>
      </section>
    </div>
  );
}
