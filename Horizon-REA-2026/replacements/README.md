# Sustitución profesional de 7 deportivos + 3 pickups (preproducción)

Esta carpeta **no sustituye los modelos del juego**. Su fin es obtener, inspeccionar y validar archivos 3D de alta calidad antes de tocar `public/models/selected` o la física Rapier.

## Reglas de aceptación

- Diez modelos reales, no imágenes, miniaturas ni primitivas que simulan marcas.
- Licencia comercial verificada por vehículo, atribución del autor y procedencia legítima. Evitar CC BY-NC, Editorial y modelos extraídos de juegos.
- GLB real con geometría sólida de carrocería, habitáculo, bajos, suspensión y ruedas independientes.
- Los cuatro pivotes `wheel_fr`, `wheel_fl`, `wheel_rr`, `wheel_rl` deben existir para preservar dirección y giro.
- Adaptación de escala, orientación (+Z adelante), batalla y altura a la dinámica del vehículo; para pickups 4x4, ajuste de masa, batalla, neumáticos y centro de gravedad.
- Máximo de 350.000 triángulos y 20 MiB por automóvil en esta primera revisión (antes de optimizar por LOD/KTX2/meshopt). Las inspecciones visuales y FPS reales siguen siendo obligatorios.
- No reemplazar los 7 modelos aprobados ni añadir las pickups a la selección hasta superar pruebas de choque, vuelco, cabina, velocidad y 60 FPS.

## Candidato disponible para auditoría

**Ferrari F430**: el repositorio de distribución incluye modelo GLB y un archivo de atribución CC BY 4.0 a Ddiaz Design. Esto **no confirma** todavía ni la autoría original, ni el interior, ni los bajos, ni la calidad del modelo: queda marcado `rightsReviewed=false` y no entra en producción automáticamente.

Para inspeccionar manualmente un GLB en `replacements/assets/<id>.glb`:

```bash
node tools/audit-replacement-models.mjs --available
```

Para intentar habilitar el lote completo en una futura integración, ejecutar `--release`: bloqueará la operación si falta cualquiera de los diez o no cumple los requisitos. **Este comando no publica**, solo valida. Una validación exitosa tampoco sustituye la inspección visual.

**IMPORTANTE:** Sketchfab exige autenticación OAuth para descargar los modelos mediante su API oficial. No usar extractores del visor ni saltarse licencias. No cambiar `main` ni GitHub Pages con autos incompletos.
