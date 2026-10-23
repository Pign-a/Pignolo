# Security Policy

## Versiones con soporte

pignolo todavía no tiene versiones publicadas. Solo se corrige la rama `main`.

| Versión | Soporte |
|---|---|
| `main` | Sí |
| Cualquier otra | No |

## Cómo reportar una vulnerabilidad

**No abras un issue público.** Usá el reporte privado de GitHub: pestaña **Security** del repositorio → **Report a vulnerability**.

Incluí, si podés:
- qué parte afecta (las skills o agentes del plugin, la auditoría de interfaz `ui-audit`, sus scripts);
- cómo reproducirlo, con el comando o el archivo mínimo;
- qué impacto ves (pérdida de datos, ejecución de un comando no pedido, una fuga de datos a un archivo versionado o a una página).

## Qué esperar

- Acuse de recibo en hasta **5 días hábiles**.
- Te mantenemos al tanto mientras se analiza y se corrige.
- Pedimos no divulgar el problema hasta que haya un arreglo o hasta **90 días** desde el reporte, lo que ocurra primero.

## Alcance

Cuentan como vulnerabilidades, entre otras:
- un script del plugin (por ejemplo los de `ui-audit`) que ejecute código o lea o escriba fuera de lo que se le pidió;
- una skill o agente que filtre secretos o datos personales a un archivo versionado, a un registro de sesión o a una página generada;
- que `ui-audit` abra, siga o publique algo fuera del proyecto y de la URL que se le indicó.

No cuentan: lo declarado como fuera de alcance en el diseño (por ejemplo, un agente adversarial o prompt injection). Pignolo 2 no bloquea comandos ni trae guardia de git: es una metodología, no una frontera de seguridad.
