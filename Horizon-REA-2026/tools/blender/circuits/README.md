# Circuitos aprobados en Blender — Horizon El Salvador

El pipeline de GitHub Actions `horizon-blender-circuits.yml` ejecuta **Blender 5** real y conserva los archivos editables en este repositorio.

| Circuito | Fuente Blender | GLB público | Estado |
| --- | --- | --- | --- |
| Monzon | `tools/blender/circuit-sources/monzon.blend` | `public/circuits/monzon.glb` | Trazado procedural jugable; GLB preparado como recurso visual |
| Suzaka | `tools/blender/circuit-sources/suzaka.blend` | `public/circuits/suzaka.glb` | GLB y fuente Blender listos; **todavía no tiene física jugable integrada** |

Los circuitos son versiones **originales e inspiradas en circuitos internacionales**. Los preartes son referencias visuales, no capturas verificadas del juego.

## Reproducción

```bash
cd Horizon-REA-2026
blender -b -t 2 --python tools/blender/circuits/build_circuits.py
```

Salida: dos archivos `.blend` y dos `.glb`. Las rutas del front-end son relativas a `import.meta.env.BASE_URL` mediante `src/world/circuitAssets.ts`.

## Precauciones de integración

- Monzon ya usa el motor procedural Three.js y Rapier. No añadir el asfalto completo del GLB simultáneamente a la carretera procedural: produciría z-fighting y geometría duplicada. Importar únicamente detalles escénicos o sustituir la carretera tras acoplar sus colisiones.
- Suzaka incluye un cruce elevado de 12 m. Para hacerlo jugable, agregar colisión de superficie 3D al puente, salida y entrada a desnivel, barreras a distintas alturas, y seguimiento de pista con distancia tridimensional para distinguir los dos niveles. No habilitar selección de Suzaka en carreras antes de ese trabajo.
- Los GLB incluyen formas editables simplificadas y materiales PBR básicos; **no** equivalen al nivel fotorrealista del prearte aprobado.
- Mantener los siete vehículos y sus archivos de Blender intactos.

## Sparda y Sakhir Horizon (dos circuitos adicionales)

Los nuevos trazados son **originales** y utilizan el mismo motor de físicas que los anteriores.

| Circuito | Trazado | Fuente Blender | GLB |
| --- | --- | --- | --- |
| Circuito Sparda | Montaña, aproximadamente 6,42 km, desniveles de hasta 70 m | `tools/blender/circuit-sources/sparda.blend` | `public/circuits/sparda.glb` |
| Sakhir Horizon | Desierto, aproximadamente 5,55 km, luces de carrera nocturna | `tools/blender/circuit-sources/sakhir-horizon.blend` | `public/circuits/sakhir-horizon.glb` |

El pipeline `horizon-blender-international.yml` crea los cuatro archivos en Blender 5 mediante:

```bash
cd Horizon-REA-2026
blender -b -t 2 --python tools/blender/circuits/build_international.py
```

La geometría de asfalto, bordes, barreras, rampa y colisiones se calcula
en Three.js y Rapier con `src/world/internationalGeometry.ts`. Los GLB aportan
**boxes, tribunas, faros y decoraciones**, ocultando sus carreteras
de referencia para que no se superpongan con el asfalto físico.

`src/world/internationalGeometry.test.ts` comprueba el cierre, la longitud,
la pendiente y radios mínimos. Sparda incluye también un terreno de colisión
para evitar que los vehículos atraviesen el paisaje fuera del asfalto.

**Estado de publicación:** comprobar siempre el resultado de la ejecución
más reciente de `horizon-pages.yml` antes de anunciar el despliegue.
