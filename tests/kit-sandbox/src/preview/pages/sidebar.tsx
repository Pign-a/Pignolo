import { useState, type ReactNode } from "react";
import { Sidebar, type SidebarGroup } from "@kit/components/sidebar";

export const meta = { title: "Sidebar" };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const groups: SidebarGroup[] = [
  {
    items: [
      { id: "inicio", label: "Inicio", href: "#/sidebar", icon: <Icon><path d="M3.5 9.5L10 4l6.5 5.5V16h-4.5v-4h-4v4H3.5z" /></Icon> },
      { id: "informes", label: "Informes", href: "#/sidebar", icon: <Icon><path d="M4 16V9M10 16V4M16 16v-5" /></Icon> },
      { id: "archivos", label: "Archivos", badge: "3", href: "#/sidebar", icon: <Icon><path d="M3 6.5A1.5 1.5 0 014.5 5h3l1.5 2h6.5A1.5 1.5 0 0117 8.5v6a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 013 14.5z" /></Icon> },
      { id: "metas", label: "Metas", href: "#/sidebar", icon: <Icon><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="2.5" /></Icon> },
    ],
  },
  {
    label: "Cuenta",
    items: [
      { id: "ajustes", label: "Ajustes", icon: <Icon><circle cx="10" cy="10" r="2.5" /><path d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.4 1.4M13.6 13.6L15 15M5 15l1.4-1.4M13.6 6.4L15 5" /></Icon> },
      { id: "ayuda", label: "Ayuda", disabled: true, icon: <Icon><circle cx="10" cy="10" r="6.5" /><path d="M8.2 8a1.9 1.9 0 113 1.5c-.7.5-1.2.9-1.2 1.8M10 13.6v.1" /></Icon> },
    ],
  },
];

const STORAGE_KEY = "kit-sidebar-demo";

export default function SidebarPage() {
  const [current, setCurrent] = useState("inicio");
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Sidebar</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        Navegación lateral que se contrae a un riel. El indicador de la página actual se desliza entre ítems. Debajo de 768 px se vuelve un cajón.
      </p>
      <button
        type="button"
        data-testid="open-drawer"
        onClick={() => setDrawer(true)}
        className="kit-focus mb-4 min-h-10 rounded-(--radius-control) border border-(--color-outline) px-4 text-sm font-medium text-(--color-on-surface) hover:bg-(--color-surface-container) md:hidden"
      >
        Abrir menú
      </button>
      <div className="flex h-[440px] gap-4" data-testid="sidebar-demo">
        <Sidebar
          label="Principal"
          groups={groups}
          currentId={current}
          onNavigate={setCurrent}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          storageKey={STORAGE_KEY}
          toggleLabel="Barra lateral"
          drawerOpen={drawer}
          onDrawerOpenChange={setDrawer}
          drawerCloseLabel="Cerrar menú"
          header={
            <button type="button" data-testid="workspace" className="kit-focus rounded-(--radius-sm) text-left font-semibold outline-offset-2">
              Cuentas del hogar
            </button>
          }
          footer={
            <a href="#/sidebar" data-testid="account" className="kit-focus rounded-(--radius-sm) outline-offset-2">
              Cuenta personal
            </a>
          }
        />
        <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-(--radius-lg) border border-(--color-border-subtle) p-4" aria-hidden="true">
          <div className="h-3 w-1/3 rounded-(--radius-sm) bg-(--color-surface-container)" />
          <div className="h-3 w-2/3 rounded-(--radius-sm) bg-(--color-surface-container)" />
          <div className="h-3 w-1/2 rounded-(--radius-sm) bg-(--color-surface-container)" />
        </div>
      </div>
      <p className="mt-4 text-sm text-(--color-on-surface-muted)">
        Actual: <span data-testid="current">{current}</span>. Contraída: <span data-testid="collapsed">{String(collapsed)}</span>
      </p>
    </div>
  );
}
