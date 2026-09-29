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
- qué parte afecta (guardia de git, respaldos, hooks, skills, pignolo-ui);
- cómo reproducirlo, con el comando o el archivo mínimo;
- qué impacto ves (pérdida de datos, un comando destructivo que no se bloquea, una fuga de datos al publicar).

## Qué esperar

- Acuse de recibo en hasta **5 días hábiles**.
- Te mantenemos al tanto mientras se analiza y se corrige.
- Pedimos no divulgar el problema hasta que haya un arreglo o hasta **90 días** desde el reporte, lo que ocurra primero.

## Alcance

Cuentan como vulnerabilidades, entre otras:
- un comando destructivo del conjunto catastrófico (borrar `.git`, `~/.pignolo`, la raíz del repo) que la guardia deja pasar;
- una forma de perder trabajo sin commitear que las instantáneas no cubren y que no esté en el registro de riesgo residual;
- que pignolo-ui publique o apruebe contenido con datos personales pese al chequeo de fuga.

No cuentan: lo declarado como riesgo residual o fuera de alcance en los specs (por ejemplo, un agente adversarial o prompt injection, §1.9 del spec del núcleo). La guardia es una capa contra errores de un agente útil pero falible, no una frontera de seguridad.
