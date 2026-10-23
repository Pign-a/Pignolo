# Seguridad: <proyecto>

Fecha: <AAAA-MM-DD>
Origen: <conversación | lectura del repo | investigación>

Memoria de riesgo del proyecto. La lee `validate` para elegir qué revisar. Proporcional: un script interno puede tener cinco líneas. No incluir valores de secretos; solo dónde viven.

## Datos
<Qué datos maneja, cuáles son personales o sensibles, dónde se guardan.>

## Usuarios
<Quién lo usa: solo el autor, equipo interno, público. Si hay roles o varios inquilinos.>

## Superficie
<Por dónde entra algo: formularios, APIs, archivos subidos, webhooks, línea de comandos. Dónde corre.>

## Qué se protege
<Lo que no debe filtrarse ni perderse, y lo irreversible (borrados, migraciones, pagos). Cómo se manejan los secretos, sin sus valores.>
