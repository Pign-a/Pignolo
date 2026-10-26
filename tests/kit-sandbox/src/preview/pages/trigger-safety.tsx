import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import { Button } from "@kit/components/button";
import { Card } from "@kit/components/card";
import { StatCard } from "@kit/components/stat-card";

export const meta = { title: "Trigger safety" };

const menuClass = "z-50 min-w-40 rounded-(--radius-md) border border-(--color-border-subtle) bg-(--color-surface) p-1 shadow-(--elevation-3)";
const itemClass = "block rounded-(--radius-sm) px-3 py-2 text-sm text-(--color-on-surface) outline-none data-[highlighted]:bg-(--color-surface-container)";

function Menu({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content data-testid={`content-${id}-menu`} sideOffset={8} hideWhenDetached className={menuClass}>
          <DropdownMenu.Item className={itemClass}>Editar</DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass}>Duplicar</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Pop({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Popover.Root modal={false}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content data-testid={`content-${id}-pop`} sideOffset={8} hideWhenDetached className={menuClass}>
          <p className="p-2 text-sm text-(--color-on-surface)">Detalle del elemento</p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const cardProps = {
  title: "Plan Profesional",
  description: "Facturación mensual",
  facts: [{ label: "Precio", value: "$ 12.900" }],
  onPress: () => {},
} as const;

export default function TriggerSafetyPage() {
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Trigger safety</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Los componentes con feedback de presión usados como disparador de un menú o popover de Radix: Enter, Espacio y clic abren una vez y no cierran de inmediato. Ni el menú ni el popover bloquean el scroll de la página (modal={false}): la página se desplaza, el menú sigue a su disparador y se oculta si este sale de la pantalla.
      </p>

      <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Menu desplegable</h2>
      <div className="mb-10 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        <Menu id="btn">
          <Button data-testid="btn-menu">Acciones</Button>
        </Menu>
        <Menu id="card">
          <Card data-testid="card-menu" {...cardProps} />
        </Menu>
        <Menu id="stat">
          <StatCard data-testid="stat-menu" label="Ingresos del mes" value={482300} onClick={() => {}} />
        </Menu>
      </div>

      <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Popover</h2>
      <div className="mb-10 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        <Pop id="btn">
          <Button variant="secondary" data-testid="btn-pop">Ver detalle</Button>
        </Pop>
        <Pop id="card">
          <Card data-testid="card-pop" {...cardProps} />
        </Pop>
        <Pop id="stat">
          <StatCard data-testid="stat-pop" label="Ingresos del mes" value={482300} onClick={() => {}} />
        </Pop>
      </div>
      <div className="h-[1200px]" />
    </div>
  );
}
