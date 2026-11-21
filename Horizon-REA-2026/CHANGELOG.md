# Registro de cambios

## 2026-11-21 — control del turbo en curvas

- El empuje extra ahora reserva agarre para el giro: entrega gradual en rectas y reducción/corte según dirección solicitada, giro real, deslizamiento lateral y adherencia.
- Conserva activación automática a 100 mph, duración de 2.2 s, recarga de 6 s y máximos de 200/230 mph. Una curva exigente cancela el resto de la ráfaga y mantiene la recarga; nunca vuelve a empujar mientras el auto derrapa.
- Regresión física con los siete GLB aprobados: 28 maniobras izquierda/derecha y controles de activación, recarga y recuperación; revisión WebGL de los siete autos en ambos circuitos obligatoria en PR.

## 2026-11-21 — acabado Ferrari, audio y estabilidad V10

- Habitáculo detallado del Ferrari con fuente Blender editable, pintura y exterior aprobados conservados, reflejos neutros y contacto proyectado compartido.
- Paddock y tribuna de Suzaka separados del asfalto sin eliminar sus modelos ni los anuncios.
- Audio con dinámica recuperada, perfiles de cilindros y motor eléctrico, controles independientes y verificación real después del mastering.
- Siete autos seleccionables, carga diferida, miniaturas reales, límites físicos de 200/230 mph, turbo y ruedas animadas; IA de Suzaka corregida.
- Publicación condicionada a pruebas, auditorías y compilación; build-info.json para verificar el commit público.
- Quedan pendientes el refinamiento individual de los otros seis interiores, audio grabado/licenciado y certificación de 60 FPS en hardware real.
