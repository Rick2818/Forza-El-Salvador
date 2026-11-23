# 10 modelos de alta fidelidad: plan de importación bloqueante

**Estado: preproducción.** No hay sustitución de autos en `main`. El juego sigue ejecutando los siete GLB actuales. El próximo circuito 4×4 se trabajará únicamente después de validar la conducción de las tres pickups.

## Fuentes verificadas por ficha pública

El manifiesto `manifest.json` registra para cada uno de los diez candidatos su modelo exacto, autor, UUID de Sketchfab, licencia anunciada y motivo de inspección. Los modelos originalmente elegidos de **Outlaw Games** (RAM y Ford) se descartaron por CC BY-NC, que no permite uso comercial: se incluyeron candidatos alternativos CC BY con otros autores.

- Ferrari F430: GLB disponible del repositorio que atribuye a Ddiaz Design (CC BY); falta comprobar autoría subyacente. Modelo con geometría reconocida como interior y bajos, **sin pivotes de rueda normalizados**.
- Porsche 911: modelo con interior de n.brizitskaya en Sketchfab, no se ha descargado.
- Bugatti Chiron: ALIEEEN en Sketchfab, no se ha descargado.
- Mercedes AMG GT Black Series: Tiaan Pretorius en Sketchfab, no se ha descargado.
- Lamborghini Aventador con interior: BlackCube en Sketchfab; el autor declara combinar dos modelos de otros creadores. **No se aprueba su licencia comercial sin examinar esa cadena de derechos.**
- Yangwang U9: tonielpro520 en Sketchfab. **No usar** versiones que tengan licencia NC o procedan de Need for Speed Mobile.
- Koenigsegg Jesko: kevin (@sohyalebret) en Sketchfab. **No usar** modelos extraídos de Real Racing 3/CSR2/PUBG.
- RAM TRX: DR1KING100K en Sketchfab, sustituto CC BY del original NC.
- Chevrolet Silverado Z71 4x4: Romanov_13 en Sketchfab.
- Ford F150 Raptor 2021: David_Holiday en Sketchfab; 1.1 M de triángulos estimados requiere simplificar antes de un juego WebGL a 60 FPS.

## Verificación automática

```bash
cd Horizon-REA-2026
node tools/audit-sketchfab-sources.mjs
node tools/audit-sketchfab-sources.mjs --strict # bloquear si no hay derechos comprobados
node tools/audit-replacement-models.mjs --available
node tools/audit-replacement-models.mjs --release
```

La API pública permite leer metadatos, **no** descargar los modelos protegidos por el flujo de descargas oficiales. Para obtener los archivos se requiere descargar en la cuenta autorizada del usuario o usar OAuth oficial Sketchfab; no se permite extracción de geometría desde su visor.

## Requisitos de publicación de los diez

1. Originales GLB descargados legítimamente y créditos/licencias guardados por archivo.
2. Auditoría de procedencia: rechazo de rips y CC BY-NC/ND/Editorial, atribución de obras derivadas y revisión de marcas.
3. Carrocería, habitáculo y bajos mecánicos verificados visualmente (incluido vuelco total).
4. Ruedas separadas, pivotes `wheel_fr`, `wheel_fl`, `wheel_rr`, `wheel_rl`, escala y eje +Z correctos. No usar la carrocería estática con ruedas duplicadas.
5. Ajustar nueva carrocería a Rapier sin modificar motores/control si no es necesario.
6. Para pickups: configurar dimensiones/batalla/altura/suspensión y una categoría 4×4, sin mezclar velocidades arcade de superdeportivos.
7. Estabilidad contra choques, watchdog de recuperación, cámara de piloto y medición de FPS en móviles y laptop.
8. Solo si todos pasan pruebas: revisión de PR, `main` y producción en GitHub Pages.

**En esta etapa ninguna ficha queda aprobada automáticamente aunque aparezca CC BY en Sketchfab.**

## Tres GLB públicos con licencia atribuida examinables en CI

El workflow `vehicle-assets-preview.yml` descarga **solo en la ejecución de GitHub Actions** Ferrari F430 (CC BY), Lamborghini Aventador con interior (CC BY), y Porsche Carrera 4S (CC BY-SA), procedentes de `supercar3d/supercar_3D_asssets`. El repositorio de distribución incluye textos individuales de atribución. Estas licencias requieren validar la procedencia original; los modelos se guardan en un artefacto efímero y **no se suben a producción**. El Porsche de evaluación NO reemplaza todavía al Porsche Turbo S priorizado originalmente.

## Mercedes

Se detectó que el Mercedes de Tiaan Pretorius anunciado anteriormente tenía licencia **CC BY-NC**. Se sustituyó la candidatura por el Mercedes AMG GT Black Series de Mona x Supercars con licencia anunciada CC BY, pero presenta coincidencia llamativa de triángulos con otras fuentes. Queda bloqueado hasta esclarecer quién posee los derechos de la malla.
