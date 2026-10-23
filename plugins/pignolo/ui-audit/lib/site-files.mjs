// Where a web project keeps the files served at the site root (robots.txt, sitemap.xml...):
// the project root, public/ (Next.js, Vite, CRA) and static/ (SvelteKit). Framework route
// handlers that generate them (Next.js app/robots.ts, app/sitemap.ts) are not files: they
// are reported as generated, never read.
//
// findSiteFile(project, urlPath) -> project-relative posix path or null
// generatedBy(project, name)     -> project-relative path of app/<name>.(ts|js|tsx|jsx) or null
// siteFiles(project)             -> the robots.txt and sitemap.xml that exist (for the scope's
//                                   single source list)
import fs from 'node:fs';
import path from 'node:path';

export const SITE_ROOTS = ['', 'public/', 'static/'];
const APP_DIRS = ['app/', 'src/app/'];
const EXTS = ['ts', 'js', 'tsx', 'jsx', 'mjs'];

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

export function findSiteFile(project, urlPath) {
  const rel = String(urlPath).replace(/^\/+/, '');
  if (!rel || rel.split('/').includes('..')) return null;
  for (const root of SITE_ROOTS) {
    const candidate = `${root}${rel}`;
    if (isFile(path.join(project, ...candidate.split('/')))) return candidate;
  }
  return null;
}

export function generatedBy(project, name) {
  for (const dir of APP_DIRS) {
    for (const ext of EXTS) {
      const candidate = `${dir}${name}.${ext}`;
      if (isFile(path.join(project, ...candidate.split('/')))) return candidate;
    }
  }
  return null;
}

export function siteFiles(project) {
  return ['robots.txt', 'sitemap.xml'].map((n) => findSiteFile(project, n)).filter(Boolean);
}
