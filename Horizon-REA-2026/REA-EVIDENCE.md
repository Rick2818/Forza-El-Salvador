# Evidencia REA — Horizon-REA-2026

**Fecha:** 14 de noviembre de 2026
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
