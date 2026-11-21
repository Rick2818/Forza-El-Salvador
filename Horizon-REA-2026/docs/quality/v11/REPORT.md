# Entrega visual y sonora — 21 noviembre 2026

## Implementado y comprobado localmente

- Ferrari: 45 detalles nuevos de habitáculo; carrocería, cristales, ruedas, pivotes y color originales conservados. La auditoría geométrica mide una desviación máxima de 9.23e-8 m por reexportación. El piso oscuro original se conserva; no se expone la superficie roja que existe debajo.
- Materiales: PMREM neutro precalculado para la pintura del Ferrari, intensidad 0.45; cielo, iluminación diurna/nocturna y color base conservados. Los otros seis autos conservan sus materiales aprobados.
- Sombras: contacto proyectado de cuatro autos en una sola llamada de dibujo, ocho triángulos y sin textura adicional. Sigue el plano de la pista, incluido el puente, y se desvanece cuando el auto está en el aire. No se presenta como trazado de rayos.
- Suzaka: el GLB original del paddock atravesaba el asfalto. Los grupos aprobados se reorientan y colocan fuera del trazado; separaciones al centro de pista de 24.50 m y 23.53 m en la revisión inicial. Se conserva la geometría y la publicidad conceptual.
- Audio: se reprodujo la pérdida de dinámica también en OfflineAudioContext. Se corrigen las frecuencias de cuerpo y se recupera la dinámica después de compresión, conservando master 0.96, recuperación 4x y los umbrales de volumen y clipping. La envolvente final se limita a 1.04; con el waveshaper 0.985 la cota teórica es inferior a 0.984.
- Sincronización: el cuerpo del motor y la combustión comparten longitud de bucle, instante de inicio y automatización de velocidad. Así se evita la cancelación aleatoria entre capas al cambiar las RPM.
- Modelos sonoros: Lamborghini 12 cilindros, Jesko 8; Yangwang tiene búfer de combustión silencioso y tonos de motor eléctrico incluso como rival. V10 sigue como opción estética, con preferencias y controles independientes conservados.
- Trazabilidad: build-info.json identifica el commit compilado y el HUD identifica V10. Las siete opciones de automóvil tienen miniaturas reales; no se añadieron pagos, servicios externos o dependencias de producción.

La validación local ejecuta 179 pruebas, incluidas las 42 carreras de tres vueltas sin recolocación. Los controles se repiten para el ajuste final de conservación del piso y margen sonoro; los resultados definitivos están en Actions y el SHA servido se comprueba tras publicar.

## Evidencia y reproducción

- `tools/audit-ferrari-shell.mjs`: compara los puntos de las mallas originales y pivotes con el GLB aprobado de 3de9b8b; tolerancia de 2 micras para números flotantes, en ambos sentidos. Incluye conservación de la pintura.
- `tools/review-art-ferrari.mjs`: capturas WebGL reales a 1920×1080 de carrera, frente, zaga e interior, con poses, cámaras y calidad idénticas en ambos circuitos. No son imágenes conceptuales ni mediciones de FPS.
- `tools/review-audio-lab.mjs`: referencia y entrega en el mismo procesamiento WebAudio; WAV de 7.5 s con los mismos escalones de RPM. Prueba determinista de volumen, crecimiento y ausencia de clipping.
- `tools/review-engine-audio.mjs`: mantiene las exigencias de aumento de al menos 50% frente a la referencia medida, crecimiento de al menos 25% del motor aislado y pico inferior a 0.99. La ventana de análisis más larga cubre los ciclos de graves; se congela también el render durante la medición.
- `tools/review-v10.mjs`: siete autos, dos circuitos, selección, pintura opaca, turbo, ruedas y gobernador físico.
- `npm test`, `npm run build`, `node tools/audit-car-glbs.mjs`, `node tools/verify-circuit-assets.mjs` y workflows de revisión y Pages.

## Rendimiento y límites

El habitáculo añade aproximadamente 4.1 mil triángulos, sin cambiar la malla exterior. La comparación inicial a 1080p registró 217→224 llamadas y 585127→589279 triángulos en Monzón; 157→167 llamadas y 692324→696584 en Suzaka. Incluye los cambios de visibilidad de los edificios recolocados. Las cifras corresponden a las poses de revisión, no a máximos de todo el circuito.

La máquina de CI usa Chromium/SwiftShader por software. Sus tiempos de fotograma y el heap de JavaScript no representan la GPU, VRAM o 1% low de la laptop. No se certifican 60 FPS ni acabado comercial final. No se rebajó la resolución de revisión ni se omitieron rivales, publicidad o pruebas para mejorar las cifras.

## Pendientes

Refinamiento individual de los otros seis habitáculos y geometrías; reflejos y cristales más avanzados sujetos al presupuesto GPU; mayor riqueza de vegetación y edificios; muestras grabadas de motor con licencia y capas adecuadas; medición real de 120 s a 1080p en el hardware del jugador. Se investigaron recursos públicos, pero no se incorporó ningún archivo cuya calidad y licencia no pudieran verificarse; el sonido distribuido sigue siendo procedural.

## Integración, publicación y reversión

El trabajo se integra mediante PR #13 desde quality/v10-race-stability, incorporando la rama artística quality/v11-audio-art. Pages exige pruebas, auditoría y compilación. Una compilación local o una rama no equivalen a publicación; la verificación final requiere que build-info.json coincida con el merge servido. Conservar bfe6f0b como referencia anterior y revertir el merge de PR #13 si es necesario.
