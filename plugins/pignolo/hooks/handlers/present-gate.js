'use strict';
// PreToolUse Artifact (spec §6.1, R-9): publicar un artifact dentro de un flujo en curso solo
// si la presentación lo permite, el HTML no lleva datos ni secretos y el lienzo "Design" tiene
// el consentimiento del proyecto. Best-effort: el `tool_input` de la herramienta no está
// medido, así que lee con tolerancia (si no entiende la forma, calla); la capa que no depende
// del hook es `present.js check` antes de publicar (skill `present`). Nunca repite el dato.
const fs = require('node:fs');
const path = require('node:path');
const { projectState, readRun } = require('../../lib/project');
const { readProjectConfig } = require('../../lib/project-config');
const { readConfig } = require('../../lib/profiles');
const pr = require('../../lib/present');

const block = (reason, alternative) => ({ exit: 2, stderr: `pignolo bloqueó la publicación: ${reason}. Alternativa: ${alternative}.\n` });

exports.run = (input, ctx = {}) => {
  const env = { ...process.env, ...(ctx.env || {}) };
  const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
  const proj = projectState({ cwd, env });
  if (!proj.active) return { exit: 0 };
  if (!readRun(proj.main).running) return { exit: 0 }; // solo dentro de un flujo vigente (un run.json ilegible cuenta como en curso)

  const ti = input.tool_input && typeof input.tool_input === 'object' ? input.tool_input : {};
  const file = typeof ti.file_path === 'string' && ti.file_path ? ti.file_path : null;
  const typeUrl = typeof ti.type_url === 'string' ? ti.type_url : null;
  if (!file && !typeUrl) return { exit: 0 };

  let projectConfig = {};
  try { projectConfig = readProjectConfig({ root: proj.main }); } catch (_) { /* project.md ilegible: sin sus claves */ }
  let userConfig = {};
  try { userConfig = readConfig({ env }); } catch (_) { /* config de usuario ilegible: defaults */ }

  // (a) El humano o el proyecto pidieron texto.
  if (pr.resolvePresentation({ userConfig, projectConfig, artifactToolAvailable: true }).mode === 'text') {
    return block('la presentación de este proyecto es texto (presentation: text) y no se publican artifacts', 'mostralo como texto en la conversación');
  }

  // (b) El HTML no lleva datos del proyecto ni secretos.
  if (file) {
    let text = null;
    try { text = fs.readFileSync(path.resolve(cwd, file), 'utf8'); } catch (_) { /* no se puede leer: no se puede mirar */ }
    if (text !== null) {
      const found = pr.scanPublishable(text, { piiPatterns: projectConfig.piiPatterns || [] });
      if (found.length) {
        const what = found.map((f) => `${f.kind === 'pii' ? 'pii-patterns' : 'secreto'} ${f.match}`).join(', ');
        return block(`el HTML coincide con ${what}`, 'sacá el dato del HTML y volvé a publicar (o mostralo como texto)');
      }
    }
  }

  // (c) El lienzo "Design" exige el consentimiento del proyecto.
  if (typeUrl && /design/i.test(typeUrl) && !pr.canvasAllowed({ projectConfig, designTypeAvailable: true })) {
    return block('el lienzo Design no tiene el consentimiento del proyecto (canvas-consent)', 'pedile el consentimiento del proyecto al humano (canvas-consent: true en project.md) o mostralo como texto');
  }
  return { exit: 0 };
};
