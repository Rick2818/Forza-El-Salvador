# Plan Comercial tipo Relevance AI

Proyecto independiente con el **plan comercial** reconstruido a partir de la observación de
embudos enterprise públicos (Relevance AI y Langflow), reimplementado como código original
para **Boltech Group**.

No contiene código, texto, marcas ni diseño copiado de terceros. No está afiliado a
Relevance AI ni a Langflow.

## Qué incluye

| Capa | Archivo | Contenido |
|---|---|---|
| Embudo clonado | `src/funnel.mjs` | 8 capas, 11 bloques de landing, 8 bloques por tarea, formulario de 6 campos |
| SEO/AEO | `src/seo.mjs` | Sitemap, robots.txt, llms.txt, canonical, hreflang, Open Graph, Twitter, JSON-LD |
| Recorridos comerciales | `src/commercial.mjs` | `adoption-services` (inspirado en Langflow) y `solution-led` (inspirado en Relevance AI) |
| Oferta y contenido | `src/offer.mjs`, `src/content.mjs` | Fichas de caso de uso, integraciones y comparativas honestas |
| Medición | `src/metrics.mjs`, `src/opportunities.mjs` | Métricas por tenant, solo desde registros persistidos |
| Configuración ES | `config/funnel.json` | 6 especialidades, agentes, precios de referencia de Boltech |
| Configuración EN | `config/funnel.en.json` | Espejo inglés con estructura idéntica |

## Precios de referencia (no ofertas finales)

- Agentes listos para configurar: desde US$69/mes, sujeto a alcance y cuotas.
- Piloto empresarial: US$600 (US$300 iniciales y US$300 contra entrega).
- Agentes a medida: implementación desde US$900.

Toda cifra exige `reference: true` **y** `quoteRequired: true`; se muestran con la nota
"Precios de referencia, no ofertas finales".

## Evidencia

`evidence/manifests/` conserva los 15 manifiestos de observación (7 de Langflow y 8 de
Relevance AI), todos en estado `IMPORTED_PENDING_HUMAN_REVIEW`. **No son capturas
certificadas** y no acreditan resultados, ingresos ni número de clientes de terceros.

## Uso local

```powershell
npm run check
npm test
npm run funnel:build
npm run commercial:build
```

El build del embudo se genera en `.clonador/funnel/build-*` (HTML bilingüe navegable).

Landing ya generada incluida: `.clonador/funnel/build-6CRzAR/index.html` (español) y
`.clonador/funnel/build-6CRzAR/en/index.html` (inglés).

## Estado

- `LOCAL_CONFIGURED`: todo funciona y está probado en local.
- `REVIEW_REQUIRED` para publicación: sin dominio, sin formulario público conectado,
  sin analítica y sin campañas.
- Nada se envía, publica ni gasta desde este proyecto.
