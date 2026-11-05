# Plan de acción — Plan Comercial tipo Relevance AI

Fecha: 2026-11-05 · Estado: `ACTIVE_DRAFT` · Presupuesto: **US$0**
Alcance: solo el plan comercial (contenido, oferta y recorridos). No incluye publicar la landing.

---

## 1. Qué

### Oferta (3 servicios, sin precio en el material)

| Servicio | Entregables | Precio |
|---|---|---|
| Implementación de un flujo | Mapa del proceso, configuración acordada, pruebas con criterio de aceptación, guía de uso | Cotización según alcance |
| Agente a medida | Requisitos validados, implementación original, validación del responsable, entrega documentada | Cotización según alcance |
| Soporte y seguimiento | Alcance de soporte, registro de incidencias, revisión de cambios autorizados | Periodicidad y precio por acordar |

### Recorridos (2)

| Recorrido | Entrada | Pasos |
|---|---|---|
| `adoption-services` (inspirado en Langflow) | Guía gratuita y biblioteca por tarea | Recurso útil → Solicitud escrita → Cualificación → Propuesta → Aceptación y pago verificados |
| `solution-led` (inspirado en Relevance AI) | Caso de uso, ficha de integración o comparativa | Contenido específico → Solicitud escrita → Cualificación → Propuesta → Aceptación y pago verificados |

### Activos a producir

- 22 piezas por kit (3 roles × 2 recorridos, 10 integraciones, 2 comparativas, 3 ofertas).
- 3 páginas por función: ventas, mercadeo, operaciones.
- 2 comparativas honestas con fuente y fecha.
- 10 fichas de integración marcadas `PROPOSED_REQUIRES_TECHNICAL_VALIDATION`.

---

## 2. Cómo

1. **Captar** con contenido específico por tarea y por rol (no con un formulario genérico).
2. **Recibir** una solicitud escrita; el formulario pide 6 campos y consentimiento, nunca presupuesto.
3. **Cualificar por escrito** con 8 campos: proceso actual, tarea repetitiva, herramientas, volumen, resultado esperado, responsable de decisión, restricciones de datos, presupuesto orientativo.
4. **Proponer** alcance y criterio de aceptación por escrito.
5. **Cotizar** después de revisar alcance; nunca antes.
6. **Cerrar** con aceptación y pago verificados.
7. **Registrar** oportunidad, recorrido, material y campaña para poder medir.
8. **Revisar** todo borrador antes de entregarlo: ninguna pieza sale sin aprobación humana.

---

## 3. Cuándo

### Días 1–30 (2026-11-05 → 2026-12-05) — captación mínima verificable

| Hito | Fecha objetivo | Criterio de hecho |
|---|---|---|
| Oferta de 3 servicios congelada | 2026-11-10 | Los 3 servicios y sus entregables aprobados |
| 22 piezas revisadas y aprobadas | 2026-11-15 | Copy aprobado pieza por pieza |
| 3 páginas por función (ventas, mercadeo, operaciones) | 2026-11-20 | Publicables en el repositorio |
| 10 fichas de integración con fuente y fecha | 2026-11-22 | Cada ficha cita origen y estado técnico |
| Ruta de solicitud escrita probada de extremo a extremo | 2026-11-28 | Recibo generado con datos de prueba |
| Métricas activas (capturas, evaluaciones, propuestas) | 2026-12-05 | Reporte por tenant sin datos sintéticos |

**Criterio de éxito:** 10 oportunidades registradas con procedencia `real` y **3 evaluaciones escritas** solicitadas.

### Días 31–60 (2026-12-05 → 2027-01-04) — superficie de comparación y prueba

| Hito | Fecha objetivo |
|---|---|
| 2 comparativas `/vs/` con afirmaciones citadas | 2026-12-18 |
| 2 casos de cliente **con consentimiento escrito** | 2027-01-04 |
| 3 piezas de academia | 2027-01-04 |
| Catálogo de plantillas publicable | 2027-01-04 |

**Criterio:** 30 oportunidades, 10 evaluaciones, 3 propuestas preparadas.

### Días 61–90 (2027-01-04 → 2027-02-03) — canales de socio

| Hito | Fecha objetivo |
|---|---|
| Directorio de socios con criterios de admisión | 2027-01-20 |
| Programa de referidos medido por origen | 2027-01-25 |
| Prospección A2A **solo con socios verificados y autorización** | 2027-02-03 |

**Criterio:** 1 propuesta autorizada enviada por adaptador verificado y 1 conversación comercial documentada.

> Las metas de 30 días (`10 oportunidades`, `3 evaluaciones`) son **hipótesis**, no pronóstico.

---

## 4. Quién

Roles necesarios. **Ninguno está asignado todavía** (`PENDING_OWNER_ASSIGNMENT`).

| Rol | Responsabilidad | Decide sobre |
|---|---|---|
| Propietario (Boltech) | Aprueba oferta, precios y publicación | Alcance, precio, autorización |
| Operador comercial | Recibe, cualifica y prepara propuestas | Siguiente paso de cada oportunidad |
| Responsable técnico | Valida integraciones y criterio de aceptación | Viabilidad técnica |
| Revisor de contenido | Aprueba copy y claims antes de entregar | Qué se puede decir |
| Revisor legal (si aplica) | Consentimiento, datos y condiciones | Texto legal |

### Matriz de decisión

| Decisión | Propietario | Operador | Técnico | Contenido | Legal |
|---|---|---|---|---|---|
| Aprobar oferta/precio | **A** | C | C | C | I |
| Cualificar oportunidad | I | **R** | C | I | I |
| Validar integración | I | C | **R** | I | I |
| Aprobar copy | **A** | C | I | **R** | C |
| Enviar propuesta | **A** | **R** | C | I | C |

`R` = responsable, `A` = aprueba, `C` = consultado, `I` = informado.

---

## 5. Mercadeo

Existe, pero como **contenido listo para revisión**, no como campaña activa.

- Material por rol comprador y por tarea concreta.
- Prohibiciones explícitas: clientes no verificados, ROI sin fuente, SOC 2 sin certificación, garantía de resultados, testimonios inventados.
- Canales definidos pero **cerrados**: `a2a`, `organic-web`, `institutional-linkedin`, `marketplaces`, `partner-programs`.
- No hay campañas, calendario editorial, email activo ni inversión publicitaria.

---

## 6. A2A

Estrategia **interna**, lista pero no activada hacia fuera.

- Componentes: `A2AClient`, `createMarketingBridge`, `ObjectiveRunner`.
- Eventos: `a2a.partner.received`, `a2a.partner.reply.received`, `marketing.a2a.material.requested`.
- Estado del canal: `LOCAL_INTERNAL_ONLY`, `sendEnabled: false`.
- Requisitos para abrir un envío externo: endpoint aprobado, identidad del destinatario, consentimiento legal y recibo firmado.
- Uso externo previsto solo en el tramo 61–90 días y con autorización explícita.

---

## 7. Automatización

| Actividad | Estado | Evidencia |
|---|---|---|
| Generar el kit de 22 piezas | **Automático** | `node src/cli.mjs commercial-build` |
| Validar configuración y SEO | **Automático** | `funnel-check`, `seo-check` |
| Registrar y deduplicar oportunidades | **Automático** | `captureCommercial`, idempotencia probada |
| Calcular métricas | **Automático** | `commercialMetrics`, excluye datos sintéticos |
| Enviar mensajes externos | **Manual / desactivado** | `externalSendEnabled: false` |
| Publicar contenido | **Manual / desactivado** | `publishingEnabled: false` |
| Redes sociales y anuncios | **No implementado** | Sin integración |
| Agenda o programación periódica | **No implementado** | `automaticSchedule: false`; sin cron |
| Aprobación antes de entregar | **Humana, obligatoria** | `requireHumanApprovalForHandoff: true` |

---

## 8. Reglas de honestidad (no negociables)

1. No se cita cifra de terceros sin enlace verificable.
2. No se reutilizan logos, testimonios ni textos ajenos.
3. No se promete un resultado que no esté medido en el propio embudo.
4. Se distingue siempre: dato propio, dato público y estimación.
5. Ninguna pieza sale sin revisión humana.

---

## 9. Definición de "plan comercial terminado"

- [ ] Oferta de 3 servicios aprobada
- [ ] 22 piezas revisadas
- [ ] 3 páginas por función listas
- [ ] 10 fichas de integración con fuente
- [ ] Ruta de solicitud probada de extremo a extremo
- [ ] Métricas activas
- [ ] Responsables asignados a la matriz del punto 4
- [ ] Criterios de los días 30/60/90 aceptados

Mientras alguna casilla siga vacía, el plan permanece en `ACTIVE_DRAFT`.
