# Botón 4×4 en primera persona — fase de preparación

Se incorporó un modo de tracción simulado 2H ↔ 4H para **RAM 1500 TRX, Chevrolet Silverado Z71 y Ford F-150 Raptor**. El botón en el HUD solo aparece cuando una pickup con un GLB compatible está seleccionada y la cámara se encuentra en **1ª persona**. Tecla **X** como alternativa a pulsar el botón; el cambio no está permitido por encima de **30 km/h**.

### Física

La fuerza de propulsión de Horizon se ejerce en el centro de masa para evitar inversiones del vehículo con el controlador de raycast Rapier. El nuevo modo 4H usa cuatro contactos de rueda para permitir tracción cuando no haya agarre en el eje trasero, y aumenta moderadamente la tracción en superficies de bajo agarre. **Es una aproximación arcade de tracción 4x4, no una simulación de transfer-case, bloqueos de diferencial y distribución de torque independiente por rueda**.

### Estado de los GLB

Los tres pickups todavía no forman parte del roster del juego. La fuente Sketchfab oficial requiere un OAuth de descarga, examen de procedencia y transformación para aportar las mallas y pivotes `wheel_fr`, `wheel_fl`, `wheel_rr`, `wheel_rl`. **No activar pickups ficticias ni sustituir los siete coches existentes antes de validar assets originales.** El circuito 4×4 se trabajará después.

### Pruebas automáticas

`npm test -- src/sim/fourWheelDrive.test.ts`. También es obligatorio correr `npm run build` y el conjunto de pruebas de la carrera antes de publicar.
