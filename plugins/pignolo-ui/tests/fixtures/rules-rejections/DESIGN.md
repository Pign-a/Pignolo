---
version: alpha
name: Fixture
pignolo:
  schema: 1
  rejections:
    - id: R-001
      date: 2026-09-20
      rule: MOTION-04
      note: El usuario rechazó transition all
    - id: R-002
      date: 2026-09-20
      pattern:
        kind: text
        value: "descubr[ií] m[aá]s"
      note: CTA genérico rechazado
    - id: R-003
      date: 2026-09-20
      pattern:
        kind: property
        value: "border-radius:\\s*9999px"
      note: Botones píldora rechazados
---

## Decisions

