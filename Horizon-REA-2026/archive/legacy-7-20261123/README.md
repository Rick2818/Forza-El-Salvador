# Copia de seguridad: 7 vehículos anteriores · Horizon El Salvador
Fecha de conservación: 2026-11-23 (El Salvador)

**Estado:** respaldo inmutable de los 7 vehículos publicados previamente.
Fuente exacta: commit `174a5125ceb73ca460ed5148a034a2628b66b4b5` de `main`.
Contenido: 7 GLB originales de `public/models/selected`, 7 miniaturas y tres archivos de configuración del catálogo de vehículos.

**No borrar estos modelos de `public/models/selected/` ni cambiar el juego actual** hasta que los diez GLB externos estén plenamente integrados, con ruedas/cámaras/colisiones y pruebas satisfactorias.
Los modelos de este archivo permanecen en una ruta externa a `public/`, por lo que NO aumentan la descarga del juego.

Recuperación: copiar este respaldo a su ruta original, restaurar catálogo y configuraciones, y volver a compilar/probar. Se puede regresar al commit fuente si fuera necesario.
Mantener como respaldo aun después de que los diez modelos externos pasen a producción.

| Archivo original | bytes | Git blob SHA |
|---|---:|---|
| `public/models/selected/bugatti-chiron.glb` | 1438844 | `b80997fffaf6cbf689d2b9ffea3c3e144acba500` |
| `public/models/selected/ferrari-california-t.glb` | 2166068 | `aa872055b8aabda6c343960a934b9fdcd836d16a` |
| `public/models/selected/koenigsegg-jesko-odin.glb` | 1543064 | `598593d0b418a2276163b5773419244be0751833` |
| `public/models/selected/lamborghini-aventador-roadster.glb` | 1258972 | `10d4e3d5a469ff1a2a3db00371ad9e02545fcf9a` |
| `public/models/selected/mercedes-amg-gt-black-series.glb` | 1623008 | `2d3f4820074114b7a6ffc393c1c4a754b48526dc` |
| `public/models/selected/porsche-911.glb` | 2059380 | `51c382b557813d12a7cb14473785af2bf62f0ebc` |
| `public/models/selected/yangwang-u9.glb` | 1450024 | `f34a74edd8ffb105ac54b0b41f026be46210f6a5` |
| `public/vehicles/previews/bugatti-chiron.png` | 254289 | `f38e8a444625de374e7152063471dda5801d6277` |
| `public/vehicles/previews/ferrari-california-t.png` | 261637 | `882163c03eed6b7afb78202d8caea724281ef8b0` |
| `public/vehicles/previews/koenigsegg-jesko-odin.png` | 271031 | `41878b1d0803d5736ec09d8816d4411d91f53752` |
| `public/vehicles/previews/lamborghini-aventador-roadster.png` | 274699 | `23ece5f1559105fb0c9538b1681435a29ffff5ac` |
| `public/vehicles/previews/mercedes-amg-gt-black-series.png` | 272272 | `3bfbbed75067d7b1417fcc279cc9af012610fe0f` |
| `public/vehicles/previews/porsche-911.png` | 247941 | `d012725f9ec278a43263c916e548bb8987d7b4cf` |
| `public/vehicles/previews/yangwang-u9.png` | 275289 | `5024ffd2d3b2a6162255442184c9358be6691f0a` |
| `src/vehicle/roster.ts` | 2845 | `c149dff79ab6b019668d690b02cce3f43c0d4fea` |
| `src/vehicle/selectedAsset.ts` | 13817 | `162bbcc9c74c94d5628ecad99d4f4375d9db739c` |
| `src/vehicle/vehicle-designs.json` | 4499 | `2504c757a5e8560b4f59681e9af47b23af6a6bf5` |

## Showroom como nueva portada (archivo activo)
Los 7 históricos ya no aparecen en el selector del jugador ni en el garaje. Sus GLB y configuración permanecen en este respaldo. Los originales en `public/models/selected` continúan como dependencia técnica de los rivales de IA y recuperación segura; no se eliminan hasta desacoplarlos y validar todos los circuitos.
`index.html` es el showroom 3D, `race.html` es el juego y `model-gallery.html` funciona como alias del showroom. La selección se conserva en `horizon.selected-vehicle`.
