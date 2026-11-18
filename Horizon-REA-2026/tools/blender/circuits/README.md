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
