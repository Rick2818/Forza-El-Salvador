# V10 — auditoría inicial, 21 noviembre 2026

Base main: bfe6f0bec835fc9d9e6ced62ca43f7e51e712499. Rama de trabajo independiente.
Línea base: 118/120 pruebas pasan; TypeScript y compilación Vite pasan.
Siete GLB auditados; solamente cuatro autos en selector. Dos circuitos jugables, dos adicionales solo como recursos.

| Problema | Gravedad | Sistema | Causa comprobada | Corrección prevista | Prioridad |
|---|---|---|---|---|---|
| Bugatti no termina Suzaka difícil en 900 s | Crítico | IA / física | Choca después de recta rápida, repite maniobra contra barrera; 272 s fuera de pista antes del primer final | Frenada y recuperación física, reproducir las tres vueltas | P0 |
| Publicación acepta fallos de pruebas | Alto | horizon-pages.yml | continue-on-error de V9 | Restaurar bloqueo tras corregir fallos, CI en rama y PR | P0 |
| Gobernador depende del render | Alto | Vehicle.syncVisual | Límite post-step solo en presentación; simulaciones sin render sobrepasan límite | Separar final de paso físico de presentación y verificar 200/230 mph | P0 |
| Prueba de adelantamiento falla | Alto | ai.test.ts | Mock carece de onTrack y halfWidth; condición considera al coche fuera de pista | Fixture completo y regresiones de recuperación/tráfico | P1 |
| Tres modelos aprobados no seleccionables | Alto | roster.ts | GLB y tuning existen pero lista tiene cuatro | Validar modelos, habilitar selección y mantener tres rivales | P1 |
| Lamborghini y Jesko conservan potencia previa a V9 | Alto | vehicle-designs.json | Velocidades declaradas 200 mph pero potencia 1.1/1.22 frente a 8.5 resto combustión | Probar aceleración real y corregir potencia de autopista si hace falta | P1 |
| Búsqueda global de pista ignora altura | Alto | Track.nearestIndex | Solo búsqueda local distingue ramas de Suzaka | Proyección coherente por altura con pruebas de cruce | P1 |
| Falta medición en GPU del usuario | Medio | Rendimiento | Entorno de pruebas usa software; no equivale al hardware del jugador | Mantener informe real y publicar límites honestos | P2 |

La compilación inicial genera un JS de 5.15 MB, 1.89 MB gzip (incluye Rapier WASM).
No se modifican pinturas ni modelos aprobados; escenografía, anuncios, mezcla de audio y Wompi se conservan.
No se certifica calidad AAA, 60 FPS ni derechos comerciales de las marcas.
