import type { ComponentType } from "react";

/**
 * A preview page is a file in src/preview/pages/ named after the component
 * (button.tsx). It default-exports a React component and exports `meta`.
 * It is listed in the nav and served at #/<file name>. No other registration.
 */
export interface PreviewMeta {
  title: string;
}
interface PageModule {
  default: ComponentType;
  meta: PreviewMeta;
}

const modules = import.meta.glob<PageModule>("./pages/*.tsx", { eager: true });

export interface PreviewEntry {
  slug: string;
  title: string;
  Page: ComponentType;
}

export const entries: PreviewEntry[] = Object.entries(modules)
  .map(([file, mod]) => ({
    slug: file.replace("./pages/", "").replace(/\.tsx$/, ""),
    title: mod.meta.title,
    Page: mod.default,
  }))
  .sort((a, b) => (a.slug === "foundation" ? -1 : b.slug === "foundation" ? 1 : a.slug.localeCompare(b.slug)));
