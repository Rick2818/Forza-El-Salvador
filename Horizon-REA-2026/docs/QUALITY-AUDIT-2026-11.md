# Horizon El Salvador — auditoría y primera versión de calidad

Fecha: 21 noviembre 2026. Base pública: f11313d. Base de revisión preservada: 5776a1a (PR #6, cuatro garajes, emblemas, salida y música). También se recuperan selectivamente el asfalto, las marcas y la iluminación del PR #5 (bb37452), sin restaurar sus boxes cerrados. No hay aprobación de publicación.

## Hallazgos y criterios

|Prioridad|Evidencia / causa|Acción y validación|
|---|---|---|
|P0|El reloj de vuelta no actualizaba lapStart: la segunda y tercera vuelta acumulaban el tiempo anterior.|Reiniciar lapStart al cruzar la meta; regresión 100/80/90 s, mejor vuelta 80 s y llegada 270 s.|
|P1|En la captura anterior las farolas eran emisivas pero el asfalto MeshBasic no recibía luz.|Asfalto rugoso PBR, cuatro luces locales sin sombras que siguen las farolas cercanas, luna neutra. Revisar capturas de recta, curva, chicana y boxes.|
|P1|Suzaka conserva árboles Sakura del GLB antiguo y una montaña cónica aislada.|Ocultar esa vegetación, añadir troncos y ramas reales optimizados en Blender, follaje tridimensional y tres LOD; cordillera de tres planos de profundidad. Revisar desde conducción, no certificar solo el render de Blender.|
|P1|Bugatti y Mercedes usan pintura MeshBasic; carecen de respuesta a luz/volumen.|Pintura opaca PBR con capa de barniz. Mantener exactamente el color base y barniz aprobado del Ferrari.|
|P1|Las pinzas estaban dentro del grupo que gira con la rueda.|Separar pinzas a la suspensión/dirección conservando la transformación mundial. Mantener geometría total y pivotes en las pruebas de GLB.|
|P1|FPS aproximados del HUD, sin registro continuo ni distinción CPU/GPU.|Registro de tiempo de pared: 15 s de calentamiento + 120 s; media, percentiles, 1% bajo, tiempo CPU, GPU asíncrono si disponible, cambios de resolución y número de objetos. Pausa/foco interrumpen; capturas manuales excluidas. Informe JSON desde pausa.|
|P1|Picos de rendimiento podían provocar que el ajuste automático aumentase la resolución al quitar sombras.|Mantener la escala ya alcanzada; recordar calidad elegida.|
|P1|Completar carreras no demuestra que haya disputa por el primer lugar.|Seis carreras físicas de tres vueltas con los cuatro GLB: guardar tiempos individuales, picos y cambios de líder. Revisar especialmente Medio/Difícil, sin forzar ganadores ni teletransportes.|
|P2|La cámara solo miraba en la dirección del coche, con poca anticipación.|Desplazamiento lateral suave hacia el trazado adelantado, sin alejar el coche. Mantener límites de cámara y tres modos.|
|P2|Música y motores solo tenían mute conjunto.|Mezclador separado, accesible en inicio y pausa, persistido y con mute maestro.|
|P2|Sonidos sintetizados y carrocerías todavía no tienen fidelidad de una producción de gran estudio.|Pendiente evaluación artística por vehículo y muestras de audio licenciadas si se incorporan después. No confundir capturas reales del prototipo con una certificación AAA.|

## Guía visual de esta revisión

Monzón: noche, estrellas, luna suave, farolas cálidas; carbón negro con rugosidad y agregado fino; líneas y pianos legibles sin neón. Rojo cereza del Ferrari protegido por pruebas de material. Árboles verde bosque, troncos café; pendientes suaves fuera de las zonas de seguridad; cuatro talleres abiertos con emblemas.

Suzaka: día claro, verdes naturales y troncos largos, copas irregulares con ramas y huecos, sin conos. Vegetación agrupada fuera de las barreras y de ambas vías del cruce. Montañas alejadas, más claras con la profundidad. Pequeño detalle de agujas en primer plano y atlas de Blender a distancia.

Objetivo técnico: 60 FPS en la laptop, sin afirmar que se han logrado hasta medirlos allí. La calidad equilibrada limita píxeles y evita sombras costosas. Los pinos se agrupan en instancias por material y LOD. El estado inicial de PR #6 medía 167 llamadas / 451373 triángulos en una captura concreta; no es el resultado de esta revisión ni un FPS de hardware.

## Pruebas y límites

`npm test` usa los GLB reales y Rapier; sustituye únicamente decodificación de imagen cuando falta en Node. Las seis carreras son simulaciones físicas a 60 Hz, NO pruebas gráficas de 60 FPS. Resultados JSONL en el artefacto de revisión. `npm run build` comprueba tipos y producción. Capturas reales WebGL por `tools/review-quality.mjs` y `tools/review-garages.mjs`, sin publicar Pages.

Pendiente: conducción manual completa, impactos contra todas las barreras y escapatorias, estabilidad visual en movimiento, escucha de mezcla final y una sesión de al menos 120 s tras calentamiento EN LA LAPTOP. El navegador gráfico local del ejecutor no puede iniciarse por restricción de sockets; se utiliza el navegador de CI para las capturas, sin presentar su software renderer como GPU del usuario. La aprobación visual/audio es anterior a modificar main y verificar GitHub Pages.

## Segunda pasada

Las capturas de la primera pasada (Actions 44915333970, commit 36f5add) mostraron pintura rosada y metales blancos en Suzaka: el entorno HDR del cielo aportaba demasiada irradiancia, aunque el color base del Ferrari era correcto. Se reduce la intensidad del entorno diurno y se equilibran sol/relleno; el material aprobado del Ferrari permanece intacto. También se sustituyen los taludes altos del trazado por terreno ondulado bajo, dejando la cordillera a distancia.

Los pinos de distancia media conservan 4307 triángulos (antes 8166), pasan al atlas lejano desde 180 m y al modelo cercano dentro de 75 m. El archivo fuente editable de Blender queda en tools/blender/sources/suzaka-pine.blend.gz.

La IA anterior completaba las seis carreras pero no cambiaba el liderato en Medio/Difícil. La segunda pasada permite aceleración completa cuando queda margen, modula el pequeño error según la potencia y usa fases de ataque en recta contra cualquier rival. Con los mismos cuatro GLB y sin recolocaciones de emergencia: Monzón Fácil/Medio/Difícil presenta 3/2/3 cambios de líder sostenidos; Suzaka 4/4/3. Cada cambio exige 1,5 s de liderato; todos terminan tres vueltas y las muestras de salida del asfalto son cero en estas pruebas. No equivale a conducción manual validada ni garantiza que cada jugador pueda ganar. Resultados completos en el artefacto JSONL.

Se corrige además la pinza integrada en el grupo accent de cada rueda del Ferrari y se verifica que las pinzas del Ferrari/Porsche no giran con el rin. El jugador recibe ahora un perfil de motor según el auto elegido; son perfiles sintéticos, no grabaciones de fabricante. El control de volumen mantiene el foco sin iniciar una carrera accidentalmente con las flechas del teclado.

Validación local: 103 pruebas y compilación correctas. Capturas finales de esta segunda pasada y prueba de interfaz en Actions pendientes de registrar al terminar. No se publica main ni Pages.
