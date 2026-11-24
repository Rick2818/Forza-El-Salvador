# V20 — Auditoría de identidad de los diez modelos (23 noviembre 2026)

**Estado: BLOQUEADO PARA RELEASE; no fusionar por aprobación de tests sin inspección visual de modelos reales.**

## Fuentes verificadas en GitHub

- PR #43 (sin fusionar), rama `art/ten-realistic-vehicles-intake-20261123`: inventario de los 10 objetivos y descarga Sketchfab mediante OAuth. Los indicadores `assetImported`, `rightsReviewed`, `geometryApproved`, `physicsApproved` y `runtimeFpsApproved` están en falso.
- PR #45 y #46 fusionados a `main`: el showroom y carrera consumen `public/models/external-candidates/*.glb`, no los objetivos del PR #43.
- Los siete GLB anteriores están resguardados en `archive/legacy-7-20261123`, y temporalmente en `public/models/selected` como dependencias de IA.

## Correspondencia exacta necesaria

| Objetivo del inventario | Variante cargada en main | Coincide exactamente |
|---|---|---|
| Ferrari F430 | Ferrari F430 | ID sí; fidelidad no validada |
| Porsche 911 | Porsche 911 C4S | Variante no certificada |
| Bugatti Chiron | Bugatti Chiron Profilée | No |
| Mercedes-AMG GT Black Series | Mercedes-AMG GT estándar | No |
| Lamborghini Aventador Roadster | Lamborghini Aventador | Variante no confirmada |
| Yangwang U9 | Tesla Roadster | No |
| Koenigsegg Jesko Odin | Koenigsegg Jesko | Variante no certificada |
| RAM 1500 TRX | RAM 3500 | No |
| Chevrolet Silverado Z71 | Silverado EV RST | No |
| Ford F-150 Raptor | Ford F-150 Raptor policial | Variante no certificada |

**Nunca usar imágenes conceptuales ni fotos comerciales como evidencia del GLB que corre en el juego.**

## Reparaciones de seguridad hechas en la rama V20

1. El showroom borra la malla del modelo anterior antes de solicitar otro GLB y no deja iniciar la carrera con un archivo que falló en cargar.
2. El showroom transmite el ID exacto también mediante `race.html?vehicle=...`, útil con `localStorage` bloqueado, y la carrera valida el parámetro.
3. El selector identifica cada modelo sin utilizar el mismo icono de deportivo o pickup para los diez.
4. Las etiquetas advierten que son candidatos, sin presentar su fidelidad o licencia como aprobadas.
5. `npm run audit:v20` reporta qué modelos faltan; `npm run release-check:v20` falla mientras falte alguno o su verificación.

## Condiciones bloqueantes

- Importar y conservar legalmente los diez GLB objetivo completos, sin extracción indebida ni sustitutos no autorizados.
- Verificar visualmente frente, lados, parte posterior, interior, bajos y ruedas a partir del **GLB real**.
- Revisar autorización comercial, marcas y cadena de titularidad; licencia declarada por un uploader no basta.
- Homologar pivotes y físicas sin añadir geometría falsa a carrocería, bajos o ruedas.
- Demostrar con pruebas de navegador que selección, ingreso a carrera, choques y 4x4 funcionan.
- Probar Monzón y Suzaka por más de dos minutos, controlar congelamiento ~1:50 y medir FPS realmente.
- Solo después: `main`, compilación, GitHub Pages y comprobación visual del despliegue.

Los diez archivos alternativos hoy disponibles **no se consideran el lote aprobado**. Ningún dato de FPS o prueba visual ha sido inventado.
