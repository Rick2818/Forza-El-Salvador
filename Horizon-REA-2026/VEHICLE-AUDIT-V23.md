# Auditoría V23

Estado: candidato, no autorizado para producción.

| Vehículo | Orientación | Ruedas | Suspensión | Controles/agarre/frenado | Colisiones/cámara/FPS |
|---|---|---|---|---|---|
| Ferrari F430 | Pendiente | Medición específica sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| Porsche 911 C4S | Pendiente | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| Bugatti Chiron Profilée | Pendiente | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| Lamborghini Aventador | Pendiente | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| Koenigsegg Jesko | Pendiente | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| Mercedes-AMG GT | Pendiente | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| Tesla Roadster | Pendiente | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| Ford F-150 Raptor | Implementado sin verificar | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| RAM 3500 | Pendiente | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |
| Chevrolet Silverado EV RST | Pendiente | Medición automática sin verificar | Perfil candidato sin verificar | Pendiente de prueba dinámica | Pendiente |

## Evidencias y continuidad
- 2b25fe30: rotación Ford candidata.
- d90e42a1: medición geométrica condicional; 40 ruedas no verificadas.
- a91cf5d1: suspensión individual provisional.
- 21926d11: arbitraje acelerador/freno, turbo, transición reversa, saneamiento entradas.
- 45b66f62: modo AWD inicial Silverado simulado.
- 449ac116: CI aislada sin despliegue.
- Terminal: Node 22, npm 10 y Chromium presentes; git ls-remote falla por DNS github.com. Conector GitHub operativo.
- Próximo: observar CI, corregir fallos, inspeccionar GLB, probar ambos circuitos, medir FPS, validar ABS/transmisión/tracción/recuperación; no fusionar hasta cumplir aceptación.
