# Tarjeta de alcance — pignolo v1

Generada por `spec-reviewer` (ronda 2) a partir del pedido literal del autor. Estado: pendiente de aprobación.

**Objetivo.** Un plugin de Claude Code que instalás una vez en tu cuenta y sirve en cualquier proyecto. Reparte el trabajo entre varios agentes especializados, comprueba él mismo que lo hecho funciona y solo te consulta lo que es decisión tuya.

## Cómo vas a saber que funciona

1. Tenés un plan con 6 tareas independientes en el perfil `max`. Hasta 3 se hacen a la vez, cada una en su rama, y solo entran a la rama de integración con las pruebas en verde. *("me gustaria hacer mas ejecuciones en paralelo… un desarrollo multi agente verdadero")*
2. Aparece una duda técnica. Pignolo busca primero en el repo y en la memoria, después con un investigador web y un verificador, y solo si la duda sigue abierta te pregunta, con opciones y recomendación. *("que todo el proceso pueda llamar ante la minima duda antes de preguntarme a mi")*
3. Se termina un diseño. No te pide aprobarlo línea por línea: te muestra esta tarjeta. Mientras tanto avanza solo en lo seguro, y nada llega a `main` sin tu OK. *("la parte de que yo apruebe el spec la cambiemos a que lo haga la IA tambien")*
4. Alguien con la suscripción de 20 dólares corre `/pignolo:setup` y elige `economy`: los agentes usan sonnet y haiku, sin paralelismo. *("para que los modelos no sean todo opus sino… sonnet y haiku")*
5. Cerrás la sesión. Queda registrado qué se hizo, en qué ramas hay trabajo, los bugs y las decisiones. Los aprendizajes pasan por un agente filtro, y lo dudoso te llega a vos. *("aprendizajes automaticos al cerrar cada sesion siempre con validacion de un agente")*
6. Un proyecto acumula 500 entradas de historia. Lo que se carga al arrancar sigue sin pasar de unas 2.000 palabras. *("evitar que a largo plazo se limite todo por el contexto")*
7. Un agente escribe un test que pasaría aunque se borre lo que dice proteger. La revisión lo frena antes de integrarlo. *("algo mas solido y re validable")*

## Tu pedido → dónde quedó

- Paralelismo, etapas de validación, modelos por rol: §5, §6, §7, §11, §12.
- Prácticas de gentle-ai y memoria Engram: §0, §10.5, §12.
- Instalación global y uso en otros proyectos: §14, §16.
- Investigadores web ante la duda: §13.
- Tests y ramas: §9 y §11.
- Skill de documentar sesiones: §10.4 (`close-session`).
- Límite de contexto: §10.2.
- Nombres en inglés: §2.
- Autonomía y cuándo llamarte: §4.
- Agentes con instrucciones propias: §6.
- Setup de modelos por suscripción: §3.1 y §7.

## Lo que pediste y quedó distinto o afuera

- *"Correcciones pequeñas con sonnet"*: en tu perfil (`max`) las correcciones van en opus; solo el explorador y el integrador usan sonnet.
- *"Que lo haga la IA también"*: la IA revisa el diseño, pero vos aprobás esta tarjeta antes de que algo llegue a `main`.
- *"La skill de documentar"*: no se adapta la actual; se reemplaza por `close-session`, que guarda en `.pignolo/state/`, en paralelo a `docs/sessions/` y sin tocarlo.
- *"Jefes con opus"*: el hilo principal usa el modelo con que abrís Claude Code; pignolo no lo fija.
- *"Instalarlo a nivel global"*: se instala por cuenta, pero cada proyecto corre `/pignolo:init` una vez.
- *"Cómo funciona el harness de gentle AI"*: se toman sus ideas con texto propio, no su harness.
- *"Re validable varias veces"*: la revisión doble por dos jueces es automática solo en `max` con riesgo alto y al cierre de cada plan; en `economy` es a pedido.

## Agregado sin que lo pidieras

- Guardia contra comandos git peligrosos, con un control al arrancar que avisa si está caída.
- Historial de git sin vencimiento en cada repo.
- Pruebas ocultas, fuera del repo, que el implementador no ve.
- "Sellos" que prueban que las pruebas corrieron de verdad.
- Pruebas de mutación opcionales.
- Bloqueo de subagentes que no sean de pignolo (incluye los de ECC y otros plugins) mientras esté activo en el proyecto.
- Bloqueo de red por rol.
- Desactivar la memoria automática de Claude Code en cada proyecto y migrarla.
- Limpiar tu lista global de comandos permitidos y `autoMode.environment`.
- Métricas y alarmas por plan.
- WSL2 como requisito para los evals de agentes con shell.

## Fuera de alcance (v1)

Modelado de amenazas y verificación de documentación; equipos de agentes (agent teams); otras IA que no sean Claude Code; CI remoto; Engram en la nube; mover o borrar sistemas de documentación de proyectos compartidos.

## Decisiones que te tocan a vos (detectadas)

- Irreversibles, una por una: desinstalar superpowers, quitar comandos de ECC, limpiar la allowlist global, cambiar la configuración de git de cada repo.
- Seguridad: la plantilla de permisos que `setup` va a proponer.
- Dependencias: Engram (opcional) y, si se usan, las herramientas de mutación.
- Licencia y publicación: repo público MIT, con atribución a superpowers.
- Costo: elegir el perfil.
- Conflictos: entre tus reglas y las de pignolo.

## Costo estimado

`max` (el tuyo) es el más caro: casi todo en opus; en un plan de riesgo alto son unas 10 revisiones en opus por tanda (5 lentes, 3 verificadores, 2 jueces). `balanced` pasa a sonnet a quienes ejecutan. `economy` usa sonnet y haiku, una tarea a la vez. `setup` va a calcular cifras concretas.
