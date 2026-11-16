# Mapa REA de la escenografía

- **Evidence ID:** `ev_823ec0ebc60ac47fd93a93b4c6f805564d9a3ef4171516e73bfdbf50609d9e82`
- **Sujeto:** `C:\Users\Ricardo\Documents\Boltech Group\Plan Comercial tipo Relevance AI\Horizon-REA-2026\src\world`
- **SHA-256:** `4c567845c35e9b6b93627dd11842c4c1f789b4512803d0bd19946eae057d767c`
- **Operación:** `analyze_javascript_application`
- **Autoridad:** `shipped-artifact` · **Confianza:** `derived`

## Métricas estáticas

| Métrica | Valor |
|---|---|
| Archivos JS/TS parseados | 4 |
| Bytes de texto leídos | 56489 |
| Nodos AST visitados | 11280 |
| Fallos de parseo | 0 |
| Hallazgos | 58 |
| Funciones identificadas | 65 |
| Relaciones semánticas | 5974 |
| Incógnitas call-flow | 2534 |
| Llamadas resueltas / candidatas / otras | 28 / 28 / 0 |

## Funciones por módulo

### `environment.ts` (13)

`Environment` · `buildForest` · `buildRidges` · `buildTracksideDetails` · `coniferGeometry` · `constructor` · `deciduousGeometry` · `fbm` · `hash` · `noise2` · `setPixelRatio` · `shadowSizeMetres` · `update`

### `nightSky.ts` (6)

`NightSky` · `addTo` · `bakeEnvironment` · `constructor` · `setPixelRatio` · `update`

### `textures.ts` (17)

`canvas` · `createAsphaltMaps` · `createBannerTexture` · `createCheckerTexture` · `createCloudTexture` · `createGlowTexture` · `createGrassTexture` · `createHeadlightPoolTexture` · `createNumberDecal` · `createSponsorTexture` · `fbm` · `hAt` · `hash2` · `textCanvas` · `tileNoise` · `toTexture` · `wrap`

### `track.ts` (29)

`?` · `?` · `?` · `?` · `?` · `Track` · `addPhysics` · `altitudeAt` · `build` · `buildBarriers` · `buildCenterline` · `buildKerbs` · `buildStartArea` · `buildTracksideBoards` · `constructor` · `dashedCenterLine` · `gripAt` · `locate` · `minimapPath` · `nearStart` · `nearTrack` · `nearestIndex` · `progress` · `push` · `ribbon` · `rightAt` · `sampleAt` · `tangentAt` · `wallGeometry`

## Grafo de llamadas

### `environment.ts::buildRidges`

- → `environment.ts::fbm` — candidate (línea 189)
- → `environment.ts::fbm` — candidate (línea 190)

### `environment.ts::constructor`

- → `environment.ts::fbm` — candidate (línea 103)
- → `environment.ts::fbm` — candidate (línea 104)
- → `environment.ts::fbm` — candidate (línea 109)
- → `environment.ts::fbm` — candidate (línea 111)

### `environment.ts::fbm`

- → `environment.ts::noise2` — candidate (línea 34)

### `environment.ts::noise2`

- → `environment.ts::hash` — candidate (línea 21)
- → `environment.ts::hash` — candidate (línea 22)
- → `environment.ts::hash` — candidate (línea 23)
- → `environment.ts::hash` — candidate (línea 24)

### `textures.ts::createAsphaltMaps`

- → `textures.ts::canvas` — resolved (línea 74)
- → `textures.ts::canvas` — resolved (línea 75)
- → `textures.ts::canvas` — resolved (línea 115)
- → `textures.ts::fbm` — resolved (línea 86)
- → `textures.ts::fbm` — resolved (línea 87)
- → `textures.ts::hash2` — candidate (línea 88)
- → `textures.ts::hAt` — candidate (línea 121)
- → `textures.ts::hAt` — candidate (línea 121)
- → `textures.ts::hAt` — candidate (línea 122)
- → `textures.ts::hAt` — candidate (línea 122)
- → `textures.ts::toTexture` — resolved (línea 134)
- → `textures.ts::toTexture` — resolved (línea 135)
- → `textures.ts::toTexture` — resolved (línea 136)

### `textures.ts::createBannerTexture`

- → `textures.ts::textCanvas` — resolved (línea 216)

### `textures.ts::createCheckerTexture`

- → `textures.ts::canvas` — resolved (línea 193)

### `textures.ts::createCloudTexture`

- → `textures.ts::canvas` — resolved (línea 166)
- → `textures.ts::fbm` — resolved (línea 173)
- → `textures.ts::fbm` — resolved (línea 174)

### `textures.ts::createGlowTexture`

- → `textures.ts::canvas` — resolved (línea 286)
- → `textures.ts::toTexture` — resolved (línea 295)

### `textures.ts::createGrassTexture`

- → `textures.ts::canvas` — resolved (línea 142)
- → `textures.ts::fbm` — resolved (línea 149)
- → `textures.ts::fbm` — resolved (línea 150)
- → `textures.ts::fbm` — resolved (línea 151)
- → `textures.ts::toTexture` — resolved (línea 161)

### `textures.ts::createHeadlightPoolTexture`

- → `textures.ts::canvas` — resolved (línea 302)

### `textures.ts::createNumberDecal`

- → `textures.ts::canvas` — resolved (línea 261)

### `textures.ts::createSponsorTexture`

- → `textures.ts::textCanvas` — resolved (línea 240)

### `textures.ts::fbm`

- → `textures.ts::tileNoise` — resolved (línea 41)

### `textures.ts::hAt`

- → `textures.ts::wrap` — candidate (línea 118)
- → `textures.ts::wrap` — candidate (línea 118)

### `textures.ts::textCanvas`

- → `textures.ts::canvas` — resolved (línea 211)

### `textures.ts::tileNoise`

- → `textures.ts::hash2` — candidate (línea 28)
- → `textures.ts::hash2` — candidate (línea 29)
- → `textures.ts::hash2` — candidate (línea 30)
- → `textures.ts::hash2` — candidate (línea 31)
- → `textures.ts::wrap` — candidate (línea 24)
- → `textures.ts::wrap` — candidate (línea 25)
- → `textures.ts::wrap` — candidate (línea 26)
- → `textures.ts::wrap` — candidate (línea 27)

### `track.ts::buildCenterline`

- → `track.ts::push` — resolved (línea 57)
- → `track.ts::push` — candidate (línea 67)
- → `track.ts::push` — candidate (línea 80)
- → `track.ts::push` — resolved (línea 84)

### `track.ts::constructor`

- → `track.ts::buildCenterline` — resolved (línea 103)

## Limitaciones declaradas por REA

- CommonJS and ESM binding relationships were recovered from inert syntax and resolved only within the inventoried artifact container.
- Graph coverage is incomplete; unavailable facts remain explicit and must not be read as absence.
- JavaScript and HTML were parsed as inert text; bundle bootstrap code was never executed.
- Static imports, entrypoints, workers, endpoints, and storage relationships do not prove runtime execution.
- Static paths and relationships may remain unresolved when expressions are dynamic or obfuscated.
- Webpack/Rspack factories were recovered from AST literals; REA did not invoke push handlers or bundle bootstrap code.
