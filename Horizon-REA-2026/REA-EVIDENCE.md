# Evidencia REA — Horizon-REA-2026

**Fecha:** 14 de noviembre de 2026 (ronda 1) · **16 de noviembre de 2026** (ronda 2, ver §8)
**Herramienta:** REA 6.8.0 (MCP `rea`)
**Alcance:** análisis estático del proyecto real y diagnóstico en tiempo de ejecución del bug de física.
**Proyecto:** `C:\Users\Ricardo\Documents\Boltech Group\Plan Comercial tipo Relevance AI\Horizon-REA-2026`

---

## 1. Artefactos analizados

| Objetivo | Operación REA | SHA-256 del sujeto | Evidence ID |
|---|---|---|---|
| `src/` (18 archivos TS/JS) | `analyze_javascript_application` | `2902f3ff28f1170fc0755024ec54fdc6bb21efaec96306217e43dd8583e54e5a` | `ev_7d92db38ce2183306e6f67e0e0ab3a2730b0d7066e382f384e02b0efd1119400` |
| `dist/` (bundle de producción) | `analyze_javascript_application` | `b825effc4d92e9034a3067ddef25527ec02ce95b76e417fc13fffcf84b634ee0` | `ev_72777a0ef6ad7590e0ceeb8c18e9659e54ba311a830b659240046bb8cd2799d0` |
| `dist/assets/index-Ck0dT0I5.js` | `open_binary` | `c49ca5199915288e86f9c2457a4ea3900645a32acc539faa765438109ca9877d` (format `javascript`) | resultado normalizado de `open_binary` |
| `rea-lab/vehicle-core.js` (artefacto original del kernel) | `analyze_javascript_application` | `dde8e94e684c8d3dd9de03f8eb487fd40d76dd2d11ec1c4dfb8efceb3d505d82` | `ev_d4a6254fa2e4d712c025512392cbfdd12b64f869068d0a0169b0f4d7f30a348d` |
| `rea-lab/` (vista de análisis) | `inspect_analysis_view` | `dde8e94e684c8d3dd9de03f8eb487fd40d76dd2d11ec1c4dfb8efceb3d505d82` | `ev_b1d1bbffa6ae6752e615c51742e1fca51946520feb0c490b50249fbbaf73d173` |

Bundle de evidencia exportado: `C:\Temp\opencode\horizon-rea-evidence.json` (67 911 220 bytes, 4 registros).

---

## 2. Resultados estáticos

### `src/` — ev_7d92db38…

| Métrica | Valor |
|---|---|
| Archivos JS/TS parseados | 18 |
| Bytes de texto leídos | 136 226 |
| Nodos AST visitados | 26 124 |
| Fallos de parseo | **0** |
| Hallazgos | 219 |
| Nodos del grafo semántico | 14 570 |
| Relaciones semánticas | 11 401 |
| Incógnitas (familia call-flow) | 5 672 |

### `dist/` — ev_72777a0e…

| Métrica | Valor |
|---|---|
| Archivos JS parseados | 1 (4 996 581 bytes) |
| Nodos AST visitados | 215 923 |
| Fallos de parseo | **0** |
| Hallazgos | 126 |
| Grafo semántico | 20 000 nodos / 9 978 relaciones (truncado por límite de REA) |

### Interpretación

- REA confirma que **todo el código compila y parsea sin errores**: 0 fallos en 18 archivos fuente y 0 en el bundle de 5 MB.
- El grafo de llamadas entre módulos queda **parcial**: 5 672 incógnitas de la familia call-flow por destinos `MemberExpression` no resolubles estáticamente. REA lo declara como limitación, no como ausencia de código.
- Por tanto, el fallo del coche **no era un error de sintaxis ni de empaquetado**: era un error de semántica en tiempo de ejecución que el análisis estático no puede resolver.

---

## 3. Limitaciones declaradas por REA

1. El grafo estático está incompleto; los hechos no disponibles son incógnitas explícitas.
2. JavaScript y HTML se analizan como texto inerte: el código de arranque del bundle no se ejecuta.
3. Las relaciones estáticas no prueban ejecución en tiempo de ejecución.
4. Las rutas y relaciones pueden quedar sin resolver si las expresiones son dinámicas.
5. La expansión de alias se limitó a 512 estados adicionales.
6. El grafo semántico del bundle se truncó a 20 000 nodos.

Estas limitaciones son la razón por la que el diagnóstico se completó con telemetría real en Chrome, no solo con REA.

---

## 4. Diagnóstico en ejecución (Chrome + Rapier)

### Síntomas medidos

| Prueba | Antes | Después |
|---|---|---|
| Altura del chasis con acelerador | 0.52 → 2.59 → 44 m | **0.52–0.54 m estable** |
| Velocidad angular máxima | 36–46 rad/s | **< 6.5 rad/s (límite)** |
| Ruedas en contacto | 0/4 en el aire | **4/4** |
| Velocidad tras 8 s con `KeyW` | 0 km/h (sin `updateVehicle`) | **113 km/h** |
| Consola | errores de ejecución | **0 errores** |

### Causa raíz

`Vehicle.applyForces` aplicaba el downforce con:

```ts
this.body.addForceAtPoint({ x: 0, y: -df, z: 0 }, { x: 0, y: 0.1, z: 0 }, true);
```

En Rapier, el punto de `addForceAtPoint` está en **coordenadas de mundo**. Con el coche a ~54 m del origen, el par resultante era de decenas de miles de N·m, levantaba el morro y lanzaba el coche. A esto se sumaban:

- Propulsión aplicada en el punto de contacto de la rueda (par de cabeceo extra).
- Fuerzas de Rapier persistentes: drag y downforce se acumulaban paso a paso.
- `world.step()` a 1/60 fijo mientras el render iba a ~30 FPS (simulación a cámara lenta).
- Cuenta atrás que anulaba `linvel` cada paso y hundía el chasis sobre su colisionador.

### Correcciones aplicadas

1. Downforce como fuerza pura en el centro de masas (`addForce`).
2. Propulsión en el centro de masas; ruedas con `setWheelEngineForce(0)` para conservar suspensión, frenos y fricción.
3. `resetForces(true)` al inicio de cada paso.
4. Bucle de física con subpasos fijos de 1/60 sincronizados con `updateVehicle(dt)`.
5. Cuenta atrás con freno de mano, sin anular la velocidad lineal.
6. Límite de velocidad angular (±6.5 rad/s) y mayor amortiguación.
7. Foco del canvas, inicio con teclas de conducción y `tabindex` en el canvas.

---

## 5. Verificación posterior (medida real)

- **0–100 km/h:** ~6 s.
- **Altura en reposo y en marcha:** 0.52–0.54 m con las 4 ruedas en contacto.
- **Giro a 90–110 km/h:** inclinación máxima medida **0.9°**, sin vuelco.
- **Vueltas de IA:** VOSS 69.5 s, MIRAI 69.3 s, SANTOS 71.4 s; los tres coches rodando estables a 80–130 km/h, `y = 0.52`.
- **Consola:** 0 errores.
- **Rendimiento observado:** 30–37 FPS a 800×526, 131–203 draw calls, ~280 000 triángulos, renderer Intel Iris Xe (ANGLE).

---

## 6. Reproducción

```powershell
$P = "C:\Users\Ricardo\Documents\Boltech Group\Plan Comercial tipo Relevance AI\Horizon-REA-2026"
npm --prefix $P install
npm --prefix $P run dev      # http://localhost:5173/
npm --prefix $P run build    # tsc --noEmit + vite build
```

Telemetría en Chrome (consola):

```js
HORIZON.stats()   // velocidad, marcha, altura, ruedas, FPS, draw calls
```

---

## 7. Conclusión

REA aportó la garantía estática (0 fallos de parseo, inventario y grafo de 18 archivos y del bundle) y delimitó lo que no puede probar. El defecto real era de semántica en ejecución y se localizó con telemetría del rigid body en Chrome. Tras las correcciones, el coche acelera, frena, gira y completa vueltas sin volcar ni salir disparado.

---

## 8. Ronda 2 — 16 de noviembre de 2026

Segundo pase completo tras los cambios de MCP Pitstop, circuito visual, entorno, audio y título del menú. El árbol de trabajo ya no es el del 14 de noviembre.

### 8.1 Artefactos analizados

| Objetivo | Operación | SHA-256 del sujeto | Evidence ID |
|---|---|---|---|
| `src/` (25 archivos TS) | `analyze_javascript_application` (`detail: summary`) | raíz del directorio (ver recepción) | recepción `ev_ee8c27a35459c81039df5d0228b308712676be44ba942d4297a74487dd91cfa7` · padre `ev_aef638e735a868a3e5e78101e5cedfc967f2c3c48e228e9be828809a6ab681df` |
| `dist/` (bundle de producción) | `analyze_javascript_application` (`detail: summary`) | `6ccf8dd2d5ab69795ef444d1dddce1a2ca3870151219aaf02636322f0bac826f` | `ev_30ce0cd435b0678e6d32f8b49152025b8d6bebfd9847dac985550936051be856` |

> Nota de uso de REA: la evidencia devuelta por `analyze_javascript_application` con `detail: summary` es un **recibo**. Las vistas (`inspect_analysis_view`) deben pedirse con el `parent_evidence_id` del recibo, y la vista de módulos exige `projection: "references"`.

### 8.2 `src/` — resultados

| Métrica | Valor |
|---|---|
| Archivos JS/TS relevantes | 25 |
| Archivos parseados | 25 (0 fallos, 0 recuperados) |
| Bytes de texto leídos | 218 623 |
| Nodos AST visitados | 38 816 |
| Hallazgos | 323 |
| Fuentes con semántica desconocida | 8 de 25 |

Relaciones semánticas retenidas por familia:

| Familia | Retenidas | Incógnitas |
|---|---|---|
| boundary | 22 | 0 |
| call-flow | 1 236 | 2 117 |
| closure | 1 027 | 0 |
| data-flow | 14 007 | 2 336 |
| object-flow | 2 056 | 3 665 |
| promise-ownership | 40 | 30 |
| request | 10 | 2 |
| timer | 2 | 0 |
| child-process / configuration / event / resource-lifecycle | 0 | 0 |

Hechos concretos verificables:

- **Endpoints de red: 2**, ambos `endpoint_kind: network`, `mechanism: call:fetch`, `resolution: partial`, valor `PITSTOP_URL`. La única salida de red del juego es el cliente MCP; REA la marca como parcial porque la URL es una constante de módulo y no un literal en la llamada.
- **Almacenamiento: 0** (`localStorage` / `sessionStorage` / IndexedDB no aparecen). No hay persistencia de puntuaciones ni de estado: coherente con el diseño actual, todo vive en memoria de la sesión.
- Las incógnitas se concentran en `call-flow` y `object-flow`, lo esperable en código Three.js/Rapier donde casi todo pasa por propiedades de objetos de terceros.

### 8.3 `dist/` — resultados

| Métrica | Valor |
|---|---|
| Archivos relevantes | 2 (`index.html` + 1 bundle JS) |
| Bytes de texto leídos | 4 983 880 |
| Nodos AST visitados | 210 245 |
| Hallazgos | 126 |
| Fallos de parseo | 0 |
| Semántica | `partial`, truncada en el tope por archivo (`max_semantic_nodes_per_file` = 20 000) |

Incógnitas omitidas declaradas por REA en el bundle: 9 676 `call-flow/dynamic-call`, 18 496 `object-flow/ambiguous-target`, 1 454 `object-flow/dynamic-property`, 1 `timer/ambiguous-target`.

### 8.4 Limitaciones de esta ronda

1. El bundle de producción está minificado: el valor marginal de REA sobre `dist/` es bajo comparado con `src/`.
2. REA no ejecuta el código: no puede afirmar que el MCP Pitstop responda ni que el circuito se dibuje. Eso solo se verifica en navegador.
3. Los topes por archivo truncaron parte del grafo del bundle; subirlos no cambia la conclusión.
4. "0 almacenamiento" y "2 endpoints" valen para lo que el análisis retuvo, no son prueba de ausencia de efectos dinámicos.

### 8.5 Conclusión de la ronda 2

El código sigue siendo estáticamente sano (0 fallos de parseo en 25 fuentes y en el bundle de 4,98 MB), la superficie de red se limita al cliente MCP y no hay persistencia oculta. Nada de esto decide si el juego se juega bien: para eso siguen valiendo las mediciones en Chrome (`HORIZON.stats()`) descritas en §4–§5.
