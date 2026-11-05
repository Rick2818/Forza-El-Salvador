# Manifiestos de evidencia REA importada

**Importados:** 2026-11-02 (diez manifiestos) y 2026-11-03 (cinco). **Estado:** `IMPORTED_PENDING_HUMAN_REVIEW`.
**Objetivos:** Langflow (`https://www.langflow.org`) y Relevance AI (`https://relevanceai.com`).

Estos archivos son los manifiestos que produjo `stageReaEvidence` al importar salidas JSON de REA. Se publican aquí porque antes vivían en `.clonador/rea-evidence/`, ruta ignorada por Git, y no eran revisables desde el repositorio.

## Lote del 2026-11-03 (verificable hoy)

Cinco observaciones reales de Chrome 156.0.8078.80 sobre CDP en loopback. **Sus artefactos originales existen en el entorno local**, por lo que aquí sí se puede recalcular y comparar el SHA-256:

| Evidencia | Página | Artefacto local |
|---|---|---|
| `ev_9f03a7bd…f74` | `https://www.langflow.org/` | `.clonador/langflow-observation.json` |
| `ev_c59595f6…f86d` | `https://www.langflow.org/pricing` (404) | `.clonador/bench/langflow-pricing.json` |
| `ev_0eb1c375…f78` | `https://www.langflow.org/use-cases/` | `.clonador/bench/langflow-use-cases.json` |
| `ev_013615ff…b62` | `https://relevanceai.com/` | `.clonador/bench/relevance-landing.json` |
| `ev_2305adaf…7ef` | `https://relevanceai.com/pricing` | `.clonador/bench/relevance-pricing.json` |

Aun así, un manifiesto **no certifica** que REA haya ejecutado la observación ni el comportamiento del tercero: la cobertura y las limitaciones siguen requiriendo revisión humana.

Las cinco se registraron con `completeness = policy_filtered`: texto de consola, fuentes de script, claves de almacenamiento, cuerpos de red y websockets se excluyeron por no estar aprobados, igual que los recursos de terceros fuera del origen.

## Qué certifican y qué no

- El campo `artifactSha256` corresponde al archivo JSON que se importó en el momento indicado en `capturedAt`.
- **Los artefactos originales no se almacenan en este repositorio** y hoy no se encuentran en el entorno local. Por tanto el hash **no puede recalcularse** y solo queda como referencia.
- Un manifiesto **no certifica** que REA se haya ejecutado, ni la cobertura declarada, ni el comportamiento de un tercero. Es un registro de importación, no una prueba de observación.
- `src/rea.mjs` guarda únicamente el manifiesto: el artefacto de origen queda fuera del repositorio por diseño.

## Para revalidar un manifiesto

1. Recuperar el artefacto original (mismo nombre en `originalFileName`).
2. Calcular SHA-256 y comparar con `artifactSha256`.
3. Si coincide, el manifiesto queda verificado como importación íntegra; la cobertura y las limitaciones siguen requiriendo revisión humana.

Si el artefacto no aparece, el manifiesto debe tratarse como **no verificable**, no como evidencia primaria.
