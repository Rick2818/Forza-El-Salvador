# Cierre del Plan Comercial — Boltech Group

Fecha: 2026-11-05 · Repo: `Rick2818/Plan-Comercial-tipo-Relevance-AI` · Presupuesto: **US$0**
Estado del plan: **CERRADO EN CONTENIDO** · Estado de publicación: **NO AUTORIZADA**

Este documento es la puerta de cierre. Dice qué está terminado, con qué evidencia, y qué
decisiones quedan exclusivamente en manos de Ricardo. No sustituye una aprobación humana ni
declara cumplimiento legal.

---

## 1. Definición de terminado

La definición estaba en `docs/PLAN-DE-ACCION.md` §9. Este es su estado real, verificado hoy.

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Oferta de 3 servicios aprobada | **CUMPLIDO** | `docs/APROBACIONES.md` (2026-11-05); `config/commercial-offer.json` |
| 2 | 22 piezas redactadas y revisables | **CUMPLIDO** | `.clonador/commercial-kit/review-xCd6Wj/` (22 `.md` + 22 submissions + manifest) |
| 3 | 3 páginas por función (ventas, mercadeo, operaciones) | **CUMPLIDO** | 6 piezas de rol: 2 recorridos × 3 funciones, en el kit |
| 4 | 10 fichas de integración con fuente y fecha | **CUMPLIDO** | `commercial/integraciones/` (10 ES + 10 EN + `manifest.json`) |
| 5 | Ruta de solicitud probada de extremo a extremo | **CUMPLIDO** | `docs/PRUEBA-RUTA-SOLICITUD.md`, resultado `PASSED` |
| 6 | Métricas activas por tenant | **CUMPLIDO** | `commercial-metrics --tenant boltech` responde con 0 reales y declara lo no disponible |
| 7 | Responsables asignados | **CUMPLIDO** | `docs/PLAN-DE-ACCION.md` §4 y matriz de decisión |
| 8 | Texto legal revisado y aprobado | **PENDIENTE — solo Ricardo** | Borradores en `docs/AVISO-PRIVACIDAD.md`, `RETIRO-CONSENTIMIENTO.md`, `CONSERVACION-DATOS.md`, todos `DRAFT_PENDING_OWNER_APPROVAL` |
| 9 | Criterios 30/60/90 aceptados | **PENDIENTE — solo Ricardo** | `docs/PLAN-DE-ACCION.md` §3 |

Los puntos 1–7 son trabajo de agente y están cerrados. Los puntos 8 y 9 requieren firma del
propietario por diseño: el plan prohíbe que el agente los apruebe.

---

## 2. Puertas ejecutadas (resultado exacto)

| Puerta | Comando | Resultado |
|---|---|---|
| Sintaxis de los 13 módulos | `npm run check` | OK, sin salida de error |
| Pruebas automatizadas | `npm test` | **52 tests, 52 pass, 0 fail** |
| Mecanismo del embudo | `npm run funnel:check` | `status: VALID` |
| SEO/AEO | `npm run seo:check` | `status: VALID`, 34 URLs |
| Kit comercial | `npm run commercial:build` | `status: REVIEW_REQUIRED` (correcto: exige revisión humana) |
| Métricas reales | `commercial-metrics --tenant boltech` | 0 oportunidades reales; sintéticas excluidas |

`REVIEW_REQUIRED` no es un fallo: es el estado honesto de un kit que espera aprobación humana.
Ningún documento de este repo declara certificación ni publicación.

---

## 3. Inventario entregado

### Mecanismo clonado (fidelidad)
- 6 especialidades × 1 agente.
- 8 capas de embudo y 11 bloques de landing.
- 8 bloques por tarea y formulario de 6 campos.
- ES y EN con las mismas rutas; 17 páginas por idioma, 34 URLs.

### Material comercial
| Pieza | Cantidad | Ubicación |
|---|---|---|
| Piezas del kit (guía, roles, integraciones, comparativas, ofertas) | 22 | `.clonador/commercial-kit/` |
| Tareas de operaciones aprobadas | 3 (ES + EN + submission) | `commercial/operaciones/` |
| Fichas de integración con fuente oficial | 10 (ES + EN) | `commercial/integraciones/` |
| Recorridos | 2 | `config/commercial-playbooks.json` |
| Canales definidos y cerrados | 5 | `config/commercial-channels.json` |

### Documentación de decisión
`RESUMEN-EJECUTIVO.md`, `PLAN-DE-ACCION.md`, `APROBACIONES.md`, `DECISIONES-LEGALES.md`,
`LEGAL-MINIMO.md`, `OPERACIONES-3-TAREAS.md`, `COPY-OPERACIONES.md`, `INTEGRACIONES-10.md`,
`PRUEBA-RUTA-SOLICITUD.md`, `REVISION-100.md`, `AUDITORIA-SITIO-BOLTECH.md`.

### Paquete de aplicación al sitio (en pausa, no aplicado)
`site/solicitud.html`, `privacidad.html`, `retiro.html`, `conservacion.html`,
`home-operaciones.html`, `README.md`. Verificado en navegador local; **no desplegado**.

---

## 4. Reglas verificadas

| Regla | Estado |
|---|---|
| Presupuesto, teléfono, tamaño de empresa y plazo **fuera** del formulario | Cumplida (6 campos exactos) |
| Precios solo de referencia (`reference: true`, `quoteRequired: true`) | Cumplida |
| Sin porcentajes de resultado, sin "el mejor", sin garantías, sin testimonios | Cumplida |
| Envío externo desactivado (`externalSendEnabled: false`) | Cumplida |
| Publicación desactivada (`publishingEnabled: false`) | Cumplida |
| Sin agenda automática (`automaticSchedule: false`) | Cumplida |
| Captura exige consentimiento explícito | Cumplida y probada |
| Aprobación final siempre humana | Cumplida |

---

## 5. Lo que queda fuera del cierre (y por qué)

| Tema | Por qué no forma parte del plan | Quién |
|---|---|---|
| Aprobar los 3 textos legales | Requiere decisión del propietario; el agente no puede certificar legalidad | **Ricardo** |
| Aceptar metas 30/60/90 | Requiere decisión comercial del propietario | **Ricardo** |
| Publicar el sitio | `publishingEnabled: false`; además hay una contradicción de destino de datos que resolver | **Ricardo** |
| Aplicar `site/` a `Boltech-Group` | Pausado por instrucción: primero cerrar el plan | Ricardo autoriza |
| Recibir datos reales | Bloqueado hasta aprobar/publicar legales y operar el canal de retiro | Ricardo |
| Revisar los 15 manifiestos REA | Son `IMPORTED_PENDING_HUMAN_REVIEW`; el plan no los certifica | **Ricardo** |
| Comparativas, academia y socios (días 31–90) | Son **ejecución** del plan, no su redacción | Ricardo + agente |

---

## 6. Decisiones abiertas del propietario

Solo tres, y todas son de aprobación, no de trabajo:

1. **Textos legales.** Aprobar, corregir o rechazar los 3 borradores. Sin esto no se publica ni se
   reciben datos reales.
2. **Metas 30/60/90.** Aceptar, ajustar o reemplazar `10 oportunidades` y `3 evaluaciones escritas`
   (declaradas como hipótesis, no pronóstico).
3. **Revisor legal.** Confirmar si se asume el riesgo sin revisión profesional (documentado) o si
   se asigna un revisor externo.

---

## 7. Criterio de cierre definitivo

El plan pasa de **CERRADO EN CONTENIDO** a **CERRADO** cuando:

- [ ] Ricardo aprueba los 3 textos legales (o registra su rechazo y el reemplazo).
- [ ] Ricardo acepta los criterios 30/60/90.
- [ ] `docs/APROBACIONES.md` no tiene filas pendientes que bloqueen publicación.

Hasta entonces, el estado correcto es el actual: plan completo y revisable, publicación cerrada,
datos reales en cero.

---

## 8. Verificación de este cierre

```
npm run check      → OK
npm test           → 52 pass / 0 fail
npm run funnel:check → VALID
npm run seo:check  → VALID (34 URLs)
```

Repetible sin credenciales externas ni red.
