# STABILITY AUDIT V25 — candidato, no producción
Fecha: 2026-11-24
PR #52. Respaldo: backup/v24-before-v25 (67133981b0a652dd135043f3afa60a4b0eb93f17).

## Evidencia reproducida V24
- Run 45434640209: 383/383 pruebas, 61/61 archivos, TypeScript + Vite exitosos.
- Run 45434640216: baseline no responde 15 s; no-rival-audio falla por frameAgeMs 5175; constant-tunnel-lights registra 6747.4 ms dentro del render y termina en watchdog. Los fallos se observaron durante cuenta regresiva en SwiftShader: no equivalen a reproducir exactamente el bloqueo de 48.349 s del usuario.
- Physics-only: 126.57 s simulados, 136.315 s de pared, 68 muestras, mínimo muestreado 59.9 FPS de callbacks (sin render), cinco vehículos de tráfico, cero rescates del jugador, sin error ni contexto perdido. Rapier máximo 88.1 ms durante esa ejecución, lógica 5.1 ms.
- Prueba específica GLB de tres pickups: 200 MPH en recta y comprobación geométrica automatizada de las 12 ruedas aprobadas (run 45433571770). Falta inspección visual y prueba de curvas de los tres vehículos.
- Baseline gráfico: 771 draw calls, 199 programas, 433 geometrías, 123 texturas (muestra de iluminación constante); no es una medición con GPU física ni referencia homogénea de FPS.
- El síntoma del usuario (cronómetro e imagen congelados con audio activo) es compatible con bloqueo del hilo principal. No está demostrada la causa raíz exacta en su equipo. Rapier no reproduce el bloqueo en el escenario aislado de 126.57 s. Suprimir audio rival no resuelve el caso de navegador. Mantener constante la iluminación por sí sola tampoco.

## Correcciones candidatas V25
- Mantener visibles las tres fuentes de luz de túneles y las cuatro de pista, apagarlas por intensidad; preservar efectos visuales y circuitos.
- Esperar recursos de escenografía y personas conocidos; preparar texturas, variantes de shaders de apertura/carrera y geometrías de tráfico antes del cronómetro. No iniciar carrera hasta completar preparación.
- Agrupar hojas rígidas opacas compatibles por material, separadamente en carrocería y pivotes de giro de ruedas. Excluir transparencias, geometría animada y materiales incompatibles; conservar fuentes GLB sin editar. Registrar presupuesto de mallas antes/después. Añadir pruebas de triángulos, bounds y pivotes independientes.
- Identificadores del selector compactados a 7–8 px y códigos cortos.
- Diagnóstico de navegador ampliado: Monzón y Suzaka con render, Monzón sin render, sin audio rival, sin medición GPU, resolución adaptativa. Instrumentar fases GPU y presupuestos de mallas.
- No modificar física, velocidades, diseño de pistas ni modelos originales durante esta etapa.

## Criterios no certificados
- Medición real posterior V25 (FPS, draw calls, shaders, memoria) y comparación en condiciones equivalentes.
- Verificar 125 s renderizados, después tres vueltas / ambos circuitos / diez modelos, 40 ruedas, 15 min por vehículo y sesiones prolongadas de 30 y 60 min.
- LOD, compresión de textura y optimización offline: no implementados; decidir con perfil gráfico y evidencia visual antes de modificar los GLB.
- La causa del incidente específico del propietario requiere prueba con hardware real o datos de diagnóstico de ese equipo; SwiftShader no sustituye GPU física.
- No integrar a main mientras existan fallos críticos o no se cumplan criterios. Producción sigue en versión anterior.

## Continuidad
1. Consultar el HEAD actual del PR #52 y sus workflows exactos. No mezclar ejecuciones de distintos commits.
2. Corregir fallos de compilación/pruebas sin relajar criterios, revisar especialmente preparación gráfica, invariantes de luces y batching.
3. Extraer logs CONTINUITY y CONTINUITY_PASS, comparar fases, programas, mallas, FPS, memoria. Si el bloqueo ocurre en preparación, instrumentar compileAsync y carga de texturas por fase; si ocurre en carrera, comparar sin medición GPU y con resolución adaptativa.
4. Una vez aprobada regresión inicial, ampliar a matriz de diez coches, ambos circuitos, sesiones prolongadas, inspección visual y GPU física.
5. Solo tras superar el control de estabilidad y calidad, revisar PR, merge, comprobar GitHub Pages y realizar prueba posterior al despliegue.


## V26 — continuidad posterior
- V25 d8a12404: run 45436733433, 385/385 pruebas y 62 archivos aprobados; build 514 ms. Run 45436733462: fallaron siete trabajos. Monzón se detuvo durante cuenta regresiva; incluso sin render después de preparación gráfica, cronómetro detenido a 4.27 s. Esto no demuestra un fallo de Rapier. Suzaka también falló.
- Mallas externas medidas: Ferrari 100→52, Porsche 18→7, Bugatti 52→41, RAM 16→16. No equivalen a FPS ni a certificación visual.
- Auditoría GLB: Mercedes AMG GT no tiene ruedas asignadas; Tesla tiene cuatro asignadas pero no medidas. Ocho modelos cumplen comprobaciones automáticas; no equivale a inspección visual.
- Respaldo backup/v25-before-v26.
- V26: programador explícito de fotogramas con un único propietario, recuperación por temporizador en primer plano si no llegan callbacks, registro de origen y latencia; pruebas unitarias de exclusión y recuperación.
- Control no bloqueante de trabajo GPU pendiente: fenceSync, clientWaitSync con espera cero; continuar simulación si el frame previo sigue pendiente. Medir FPS de render separado de callbacks y comprobar que las imágenes siguen actualizándose. No implica que un controlador gráfico totalmente bloqueado pueda recuperarse.
- Prueba física aislada ahora desactiva render antes de preparar la carrera, evitando contaminarla con la precarga GPU. Exigir actividad real de render en pruebas gráficas y cinco vehículos de tráfico.
- Mercedes y Tesla: intentar ajuste geométrico de ruedas mediante mallas originales; registrar nombres y bounds si no se logra identificar. No dar por aprobados hasta auditoría de los diez modelos.
- Siguiente: consultar HEAD y workflows V26; corregir fallos y comparar con V25; no merge hasta verificar continuidad gráfica, ruedas y criterios de aceptación. LOD, KTX2, pruebas prolongadas y GPU física aún pendientes.
