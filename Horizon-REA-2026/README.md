# Horizon El Salvador

Videojuego de carreras 3D para Chrome. Código TypeScript, renderizado Three.js r187, física Rapier y construcción con Vite. Vehículos GLB, talleres y pinos editables en Blender; texturas de pista y otros elementos generados por el proyecto.

Repositorio: **Rick2818/Forza-El-Salvador**. Juego publicado: https://rick2818.github.io/Forza-El-Salvador/

## Estado al 21 de noviembre de 2026

| Área | Estado |
| --- | --- |
| Versión V10 | Siete autos seleccionables; física y conducción de Suzaka corregidas |
| Validación local V10 | 179/179 pruebas; 42 carreras de tres vueltas, todas finalizadas sin recuperaciones por teletransporte |
| Integración | Rama `quality/v10-race-stability`, PR #13; integración y publicación sujetas a los controles de calidad y verificación del SHA público |
| Publicación | GitHub Pages solo despliega si pasan pruebas, auditorías y compilación; `build-info.json` identifica el commit servido |
| 60 FPS en la laptop | Objetivo pendiente de medir en hardware real |
| Fidelidad artística | Modelos aprobados conservados; el objetivo de calidad comercial todavía exige refinamiento y evaluación del jugador |

Las capturas proceden del motor real del juego, no de fotografías de referencia. Las imágenes de revisión con la leyenda **CAPTURA** usan poses y pasos controlados; no son un contador de FPS medidos. Los circuitos son trazados originales inspirados en disciplinas de automovilismo, sin afiliación con los autódromos reales ni con Forza.

## Autos, pistas y dificultades

Siete autos seleccionables (cuatro participantes por carrera):

- Ferrari California T: material rojo cereza aprobado, opaco, con barniz suave.
- Porsche 911: grafito oscuro y pinzas amarillas.
- Bugatti Chiron: negro y cobre.
- Mercedes-Benz AMG GT Black Series: rojo, configuración visual Safety Car.
- Lamborghini Aventador Roadster: azul metálico.
- Yangwang U9: negro, propulsión eléctrica.
- Koenigsegg Jesko Odin: grafito y dorado.

Solo dos circuitos seleccionables:

- **Monzón:** noche, estrellas, asfalto negro, farolas y cuatro talleres abiertos con emblemas de cada marca; herramientas, llantas y motores visibles.
- **Suzaka:** día, trazado en ocho con puente, pinos de tronco largo y copas con ramas/agujas, terreno ondulado y montañas al fondo.

Cada carrera tiene un jugador, tres rivales físicos y tres vueltas. **Fácil, Medio y Difícil** cambian ritmo, reacción y presión de adelantamiento. Los rivales frenan según el trazado, buscan espacios y disputan la punta usando los mismos coches físicos. Los parámetros son ajustes del videojuego, no prestaciones reales homologadas.

La salida automática comparte el reloj de carrera entre rojo, amarillo y verde. Los cuatro autos permanecen detenidos hasta el verde. La salida es completamente silenciosa musicalmente; al finalizar la carrera se activa una celebración sonora original o el archivo local seleccionado por el jugador; los motores del jugador y los rivales se sintetizan con Web Audio. Motores/neumáticos y música tienen controles separados; `M` silencia el conjunto. No se presentan estos perfiles como grabaciones de los motores originales.

## Turbo automático, llamas y ruedas animadas — actualización V9

Configuración arcade aprobada (no son especificaciones de fábrica). La velocidad en el HUD se expresa en **MPH**:

| Auto | Velocidad máxima del juego |
| --- | ---: |
| Ferrari California T | 200 mph (321,9 km/h) |
| Porsche 911 | 200 mph (321,9 km/h) |
| Lamborghini Aventador Roadster | 200 mph (321,9 km/h) |
| Mercedes-Benz AMG GT Black Series | 200 mph (321,9 km/h) |
| Koenigsegg Jesko Odin | 200 mph (321,9 km/h) |
| Yangwang U9 | 200 mph (321,9 km/h) |
| **Bugatti Chiron** | **230 mph (370,1 km/h)** |

Los siete registros de `vehicle-designs.json` ahora tienen sus valores en m/s exactos (200 mph = 89.408 m/s, 230 mph = 102.8192 m/s). El controlador limita físicamente la velocidad horizontal después de cada paso de la simulación Rapier, también cuando no se renderiza: turbo, cuesta abajo y altas RPM no pueden superar el techo configurado. Las velocidades siguen dependiendo de aceleración, curvas y longitud de recta: son **límites**, no velocidades garantizadas en cualquier sector.

El turbo de competición se activa **automáticamente** al llegar a **100 mph (160,9344 km/h)** con acelerador pulsado y neumáticos sobre la pista, solo para el jugador. Da un impulso de fuerza durante **2,2 segundos**, seguido de un tiempo de recarga de **6 segundos**, con **llamas naranja y amarillo** saliendo de los escapes y un indicador TURBO en el velocímetro. Se cancela al frenar o usar el freno de mano. No se activa parado, en reversa, fuera de pista ni durante la cuenta regresiva; no implica un escape real en los coches eléctricos, es un recurso de fantasía del videojuego.

Se corrigió la animación de ruedas: las dos delanteras muestran el giro de la dirección física, las traseras no giran lateralmente y las cuatro rotan según la distancia recorrida, incluyendo diferencia entre llanta interior y exterior en curva. Las pinzas de freno quedan fijas respecto al soporte de dirección. No se han cambiado los modelos GLB, la pintura, los cristales ni la geometría de los circuitos.

Las pruebas automáticas incluyen `src/sim/turbo.test.ts`, `src/sim/wheelMotion.test.ts`, `src/vehicle/speedCaps.test.ts` y `tools/review-turbo-wheels.mjs`, que comprueba el efecto real en Three.js y Rapier. El objetivo de 60 FPS requiere medición en hardware real; estas geometrías son ligeras y no implican que se haya certificado una tasa constante.

## Publicidad conceptual en los dos circuitos

La revisión de partners incorpora **Aramco, AWS, DHL, Heineken, Lenovo, LVMH, MSC Cruises, Pirelli, Qatar Airways y Salesforce** tanto en Monzón como en Suzaka. V8 amplía la pauta original de solo 20 vallas a **80 posiciones objetivo por vuelta (ocho apariciones por marca)** repartidas por todos los sectores del trazado; una ubicación solo se materializa si supera las comprobaciones de seguridad. El planificador no desplaza las vallas a kilómetros de su sector, evitando el efecto de publicidad amontonada cerca de la salida. La publicidad del área de garajes y los pórticos existentes se mantiene. Se excluyen los boxes/tribuna de Monzón, cruces de Suzaka y zonas elevadas sin terreno seguro. El atlas de Canvas sigue compartido, con marcos y soportes instanciados. Se comprueba la cobertura real por deciles de la vuelta y se capturan vistas en sectores medio y final, no solo cerca de salida.

**Alcance legal:** son representaciones tipográficas conceptuales para revisión, no logotipos oficiales ni patrocinios acreditados. Antes de explotar comercialmente el juego con las marcas es necesario obtener los derechos/autorizaciones correspondientes y verificar las restricciones publicitarias aplicables (especialmente bebidas alcohólicas).

### V7 — paletas sRGB aprobadas

La fuente única para el color es `src/world/tracksidePartners.ts`. Estas **paletas propuestas por el usuario** se almacenan como valores HEX sRGB exactos; no son certificaciones de identidad corporativa ni implican acuerdos con las empresas.

| Partner | Fondo | Texto | Acento |
| --- | --- | --- | --- |
| Aramco | `#00A19B` | `#FFFFFF` | `#7CE0C3` |
| AWS | `#1A2A44` | `#FFFFFF` | `#FF9900` |
| DHL | `#FFCC00` | `#D40511` | `#D40511` |
| Heineken | `#006B3F` | `#FFFFFF` | `#E1251B` |
| Lenovo | `#E2231A` | `#FFFFFF` | `#B51E17` |
| LVMH | `#111111` | `#F4F1EA` | `#C7A86D` |
| MSC Cruises | `#003B70` | `#FFFFFF` | `#D9E4F2` |
| Pirelli | `#FFD100` | `#C8102E` | `#C8102E` |
| Qatar Airways | `#5C1635` | `#FFFFFF` | `#D8C3CB` |
| Salesforce | `#00A1E0` | `#FFFFFF` | `#BFEFFF` |

Los carteles comparten un atlas Canvas2D sRGB y usan `MeshBasicMaterial` sin tone mapping para conservar el color frente a la iluminación nocturna y diurna. Se añadió un contorno tipográfico discreto para la lectura de combinaciones con contraste moderado; el color del texto no cambia. Las estructuras de cartel, distribución y soportes permanecen iguales.

La batería `src/world/tracksidePartners.test.ts` verifica el catálogo, los valores HEX exactos y la distancia de seguridad de cada valla. La verificación real `node tools/review-partners.mjs` inspecciona en navegador **la textura utilizada en los dos escenarios**, lee píxeles de fondo, acento y texto, comprueba materiales compartidos, carteles elevados y boxes, y produce `review/partners/v7-brand-atlas.png`, capturas 1920×1080 e informe JSON. Esta prueba asegura valores exactos en el **atlas**, no equivalencia fotométrica de cada píxel en todas las pantallas.

La publicación de V7 solo debe considerarse confirmada tras el workflow en GitHub Pages y una petición HTTP satisfactoria al sitio. Los 60 FPS siguen condicionados a una sesión de prueba en hardware real; render SwiftShader de CI no certifica el rendimiento de la laptop.

## Música al terminar la carrera; salida sin música

Se retiró por completo la música de la cuenta regresiva. Las luces roja, amarilla y verde siguen funcionando, sin música. Al mostrar el resultado de la carrera, se activa la celebración musical original `VictoryFanfare` con volumen alto, pero limitado contra saturación. El control del menú se llama **Música de victoria** y empieza en 100 %; el botón M continúa silenciando todo.

La canción comercial **«We Are the Champions» de Queen** no está incluida en el repositorio, por estar protegida por derechos de autor. En el menú **Sonido → Audio de victoria propio** el jugador puede seleccionar un archivo local de audio que tenga derecho a usar: se reproduce al final sin subirlo al servidor ni incluirlo en la distribución pública. El archivo se mantiene solo durante la sesión del navegador; tras recargar o cambiar de circuito puede ser necesario seleccionarlo nuevamente. Sin archivo seleccionado se usa el tema de victoria original. No se almacena ni transmite la música a GitHub.

Pruebas: unidad para el tema original, comprobación de ausencia de música de cuenta regresiva, semáforo sincronizado, activación de celebración al llegar a resultados, respeto de mute y limitación de picos.

## Ajuste reforzado de volumen V10 y auditoría acústica

El primer incremento medio-fuerte seguía siendo insuficiente en altavoces: el sonido pasaba por un volumen maestro de 0.55 y solo se medía hasta el primer compresor, no la señal final que oye el jugador. La mezcla actual aumenta el nivel maestro de carrera de 0.55 a **0.96**, incorpora **4.0× de ganancia de recuperación** tras la compresión del motor, y utiliza un compresor adicional seguido de saturación suave con sobremuestreo 4× para controlar los picos. La música de victoria mantiene su circuito de mezcla independiente. La prueba acústica compara el RMS final del navegador con la mezcla anterior y exige como mínimo un **50 % más en ralentí y altas RPM**; este porcentaje se refiere a amplitud digital RMS, no a un aumento medido en decibelios acústicos del altavoz. El control **Motores y neumáticos** continúa respetando el volumen guardado por el usuario: comprobar que no esté bajo o en 0 %, y que el botón M no esté silenciado.

La prueba `tools/review-engine-audio.mjs` graba y mide RMS y picos **después del volumen maestro** con RPM de ralentí, media y altas revoluciones, rechazando audio muy tenue o digitalmente saturado. Esto verifica señal electrónica del navegador, no sonoridad real del dispositivo o auriculares.

## Ajuste de volumen medio-fuerte del V10

Se elevó la ganancia dinámica del motor desde el ralentí hasta altas RPM para corregir el volumen excesivamente débil: el nivel programado pasa de aproximadamente 0.14 a 0.36 en ralentí y de 0.39 a 0.81 a plena carga, antes del control del usuario. Se amplió moderadamente la presencia de combustión, bajos y admisión; un `DynamicsCompressorNode` en el bus de motores/neumáticos protege los picos al juntarse varios vehículos. El mezclador de la celebración se controla por separado y tiene limitador de picos.

El ajuste **Motores y neumáticos** continúa siendo independiente y respeta el valor guardado por el jugador, incluido 0 %; el juego no sube por sorpresa un volumen que el usuario haya reducido manualmente. Para escucharlo, activar `V10 deportivo (sintetizado)`, ajustar Motores y neumáticos al 80–100 % y comprobar que el botón M no esté en silencio.

`tools/review-engine-audio.mjs` mide RMS y picos del motor procesado a 950, 3000, 5800, 7800 y 2800 RPM, captura una muestra WebM y comprueba la ausencia de silencio y saturación. Es una prueba de salida digital, no una medición de volumen acústico real de los altavoces.

## Sonido deportivo V10 (perfil opcional; audio procedural)

El sonido anterior estaba basado en ondas diente de sierra y cuadradas, lo que producía un zumbido tipo rasuradora. El nuevo motor de audio crea un **buffer periódico de impulsos de combustión** según cilindros/RPM, un componente grave de cigüeñal, una capa de admisión filtrada y cambios suaves de volumen/filtro al acelerar o desacelerar. También aplica atenuación espacial y Doppler limitado a los tres rivales.

Desde el menú de inicio o pausa, **Sonido del motor** permite escoger:
- **V10 deportivo (sintetizado):** el mismo carácter de diez cilindros para todos los autos; es un efecto estético de carreras, seleccionado inicialmente.
- **Perfil por vehículo (sintetizado):** conserva las configuraciones aproximadas por motor (Ferrari V8, Porsche seis cilindros, Bugatti W16 y Mercedes V8).

El ajuste se guarda localmente cuando el navegador lo permite. Los motores/neumáticos mantienen su volumen independiente de la música de victoria. La producción no contiene audios obtenidos de videos de terceros.

**Limitación fundamental:** los sonidos son procedurales, NO grabaciones de un V10 real; todavía se necesita evaluación auditiva en altavoces/auriculares y, para un simulador con grabación auténtica, muestras grabadas y licenciadas con capas de ralentí, carga, descarga y altas RPM. La respuesta del audio sí depende de RPM, acelerador, distancia y cambio de relación. No atribuir el sonido del V10 a los fabricantes de los cuatro vehículos.

## Instalación y uso local

Recomendado: **Node.js 22+**, npm y Chrome con WebGL2. Blender, Python, numpy y Pillow solo se requieren para reconstruir determinados activos, no para jugar ni compilar el código web.

Desde la raíz del repositorio:

```bash
cd Horizon-REA-2026
npm ci
npm run dev
```

Abrir `http://127.0.0.1:5173/`. Elegir auto, pista, dificultad y calidad; pulsar **Iniciar carrera**.

```bash
npm test
npm run build
npm run preview
```

La vista previa de producción utiliza `http://127.0.0.1:4173/`. Vite resuelve los recursos con una base relativa para GitHub Pages. Los archivos de modelos necesarios deben estar presentes; si falta un GLB o un pivote de rueda, se informa del fallo en vez de sustituir el auto por una carrocería genérica.

## Controles

| Acción | Teclas |
| --- | --- |
| Acelerar | `W` / `↑` |
| Frenar y marcha atrás | `S` / `↓` |
| Dirección | `K` / `L`, `A` / `D` o `←` / `→` |
| Freno de mano | `Espacio` |
| Pausa y continuar | `Esc` / `P` |
| Cámara cercana, capó y panorámica | `C` |
| Recuperar el auto en pista | `R` |
| Silenciar | `M` |

La pérdida de foco pausa la carrera. Los controles de volumen conservan sus flechas de teclado y el foco; esas teclas no deben acelerar ni iniciar una carrera. Auto, circuito, dificultad, calidad elegida y niveles de audio se conservan en el almacenamiento local cuando el navegador lo permite.

## Cambios de la revisión integral

- Asfalto nocturno con agregado, normal y rugosidad; cuatro luces locales de farolas cercanas, marcas de frenado, señales y escapatorias legibles.
- Iluminación nocturna más neutra y corrección del entorno HDR diurno que deslavaba la pintura de Suzaka. Se conserva el material cereza del Ferrari.
- Garajes de Ferrari, Porsche, Bugatti y Mercedes-Benz, con bancos de trabajo, herramientas, repuestos y motores de Blender.
- Pinos de Suzaka con geometría de tronco y ramas de Poly Haven, agrupación natural y tres niveles de detalle; se retira la vegetación antigua de esa pista.
- Pintura PBR para Bugatti/Mercedes, pinzas separadas del giro del rin y lotes de geometría estática que conservan los triángulos de los autos.
- Cámara cercana con anticipación suave de curvas y límites de pista.
- Cronómetro corregido: cada vuelta mide su propio tiempo, en vez de acumular las vueltas previas.
- IA con aceleración aprovechable en rectas y maniobras de ataque; verificación de lideratos sostenidos, llegada y ausencia de recolocaciones de emergencia.

Auditoría, prioridades, segunda pasada y límites: [docs/QUALITY-AUDIT-2026-11.md](docs/QUALITY-AUDIT-2026-11.md).

## Pruebas y evidencia

`npm test` cubre materiales, selección de siete autos, pivotes, conservación de geometría al agrupar mallas, pinzas de freno, física Rapier, 42 carreras de tres vueltas, niveles de dificultad, salida sincronizada, cronómetro, audio y registro de rendimiento. En Node se sustituye la decodificación de imágenes, conservando el análisis real de GLB, geometría, materiales y física.

Como referencia histórica, las seis carreras de la segunda pasada usaron un conductor de prueba automático para el jugador y registraron cambios de líder sostenidos durante al menos 1,5 segundos: Monzón **3/2/3**, Suzaka **4/4/3** en Fácil/Medio/Difícil; todos terminan y no necesitan recolocación de emergencia. Los resultados se guardan en `review/quality/race-validation.jsonl` dentro del artefacto de Actions. Estas simulaciones no equivalen a una prueba de FPS ni a una validación humana de la conducción.

Pruebas de velocidad máxima en un plano, 180 segundos de simulación: Ferrari **205,0 mph**, Porsche **205,0 mph**, Bugatti **234,6 mph**, Mercedes **202,0 mph**. No significa que cada recta permita alcanzar esos máximos.

La tarea `.github/workflows/monzon-garages-review.yml` ejecuta pruebas y compilación, abre Chrome con WebGL/SwiftShader y genera:

- `review/quality/`: recta, curva, chicana, boxes, puente, pinos y vistas de los cuatro autos en ambos circuitos; métricas de cada captura y resultados de carrera.
- `review/garages/`: talleres, interior, vista de conducción, señales roja/amarilla/verde, silencio de salida y comprobación de celebración al finalizar.

El artefacto **monzon-garages-review** permite revisar la rama sin publicar Pages. Los archivos de `review/` se generan durante la verificación; no se confunden con fotografías de referencia.

## Medir rendimiento de verdad

La física usa pasos fijos de **60 Hz**. Ese número no representa los FPS gráficos.

1. Probar la versión que se desea evaluar en la laptop, con Chrome enfocado y conectado a corriente.
2. Anotar CPU/GPU, resolución de pantalla y calidad; correr con los siete autos.
3. Mantener la carrera continua durante **15 segundos de calentamiento y 120 segundos de medición** por circuito.
4. Al finalizar, pausar y pulsar **Descargar informe de rendimiento**. La pausa posterior no invalida una medición ya completada.
5. Revisar el estado `complete`, FPS medio, percentiles, 1 % bajo, tiempos CPU/GPU cuando estén disponibles, resolución, calidad, geometrías y texturas. Si hubo pérdida de foco o pausa antes de completar, reiniciar la carrera y repetir.

También están disponibles `HORIZON.stats()` y `HORIZON.performanceReport()` para diagnóstico. El informe registra si cambió la resolución: la calidad adaptable puede mantener fluidez a costa de nitidez. No se han certificado 60 FPS en la laptop con esta revisión. SwiftShader es un renderizador por software de CI y sus resultados no predicen la GPU del jugador.

La calidad equilibrada limita la densidad de píxeles, omite sombras costosas, agrupa objetos y usa niveles de detalle. Los pinos utilizan **10104 triángulos cerca**, **4307 a distancia media** y **6 por árbol lejano**; como máximo siete lotes de material para el bosque. Las capturas registran llamadas y triángulos realmente dibujados en cada vista.

## Blender y procedencia de activos

| Activo | Archivos |
| --- | --- |
| Cuatro vehículos activos | `public/models/selected/`; registro `src/vehicle/roster.ts` |
| Fuentes y diseño de vehículos | `tools/blender/selected-sources/`; `src/vehicle/vehicle-designs.json` |
| Equipo de garajes | `tools/blender/monzon-garage-kit.py`; `public/scenery/monzon-garage-kit.glb.gz` |
| Pinos editables | `tools/blender/sources/suzaka-pine.blend.gz` |
| Preparación y exportación de pinos | `tools/blender/prepare-pine.py`; `tools/blender/suzaka-pine.py` |
| LOD y atlas de pinos | `public/scenery/pine-near.glb.gz`, `pine-medium.glb.gz`, `pine-far.png` |
| Emblemas de garajes | `public/brands/README.md` |

Para reconstruir los pinos con Python y Blender instalados:

```bash
python tools/blender/prepare-pine.py /tmp/horizon-pine
blender -b --python tools/blender/suzaka-pine.py -- /tmp/horizon-pine /tmp/horizon-pine/built
```

La preparación toma la distribución de agujas y la geometría de tronco/ramas de **Pine Tree 01** de Poly Haven, licencia CC0. La receta de Blender crea los LOD y tres renders transparentes del árbol para el atlas; el juego no descarga recursos de terceros durante la carrera. Procedencia y ensamblado del atlas: [public/scenery/PINE-SOURCE.md](public/scenery/PINE-SOURCE.md).

Las marcas y nombres identifican los vehículos y talleres; el juego no está afiliado a los fabricantes. No se importan modelos de Forza.

## Estructura del código

| Carpeta | Responsabilidad |
| --- | --- |
| `src/core/` | Entrada, ajustes y almacenamiento |
| `src/sim/` | Cálculos de motor, transmisión, neumáticos y aerodinámica |
| `src/vehicle/` | Modelos, vehículos físicos, acabados e IA |
| `src/world/` | Trazados, terreno, iluminación, talleres y vegetación |
| `src/race/` | Carrera, vueltas, tiempos y clasificación |
| `src/render/` | Cámaras, efectos, agrupación y medición de rendimiento |
| `src/ui/` | Menú, selección, pausa y HUD |
| `src/audio/` | Motores, rivales y música original de victoria |
| `tools/` | Construcción de activos y capturas reproducibles |
| `tests/` | Validaciones con modelos GLB y Rapier |

## Publicación y pendientes

`.github/workflows/horizon-pages.yml` publica desde `main`. El usuario aprobó las capturas y el audio de esta revisión el 21 de noviembre de 2026; el PR #6 se integró mediante `66ba205`. El resultado de publicación se comprueba en Actions y en la URL pública. Para futuras revisiones visuales, aprobar las capturas y el audio antes de incorporarlas a producción. Actualizar una rama o abrir un PR no equivale a publicar el juego.

Antes de aprobar una entrega final quedan: conducción manual completa en ambos circuitos, impactos en barreras y escapatorias, revisión visual en movimiento, escucha de mezcla y medición sostenida en la laptop. La fidelidad de algunas carrocerías y el audio sintetizado siguen siendo oportunidades de mejora; no se garantiza equivalencia visual con un título AAA.

## Auditoría y validación V10

Diagnóstico reproducido sobre `bfe6f0b`: 118/120 pruebas aprobadas; Bugatti bloqueado en Suzaka difícil y una fixture de adelantamiento incompleta. V10 conserva las pruebas competitivas, añade validación completa de siete configuraciones y restaura el bloqueo de publicación ante fallos.

La IA mantiene su envolvente física de frenada aunque aumente la dificultad; reduce velocidad y evita adelantar en la sección elevada, distingue el tránsito bajo el puente y corrige la dirección al retroceder. Los nuevos autos cargan al seleccionarlos, manteniendo la descarga inicial de cuatro modelos. Lamborghini, Jesko y U9 tienen potencia suficiente para alcanzar sus 200 mph en recta larga.

Evidencia y decisiones: `docs/quality/v10/AUDIT.md`, `TECHNOLOGY.md`, `validated-races.jsonl` y el informe de entrega. El workflow `horizon-v10-quality.yml` captura los siete autos en ambos circuitos, comprueba turbo, animación y gobernador en el navegador, conserva anuncios/audio y compara V9/V10. Los datos SwiftShader son diagnósticos por software; no representan la GPU del jugador.

Reversión: conservar el commit anterior a integrar V10; revertir el merge de PR #13 y dejar que Pages vuelva a compilar. Verificar el SHA público de `build-info.json` tras cada publicación.

## Acabado visual y sonoro — noviembre 2026

Ferrari California T conserva las mallas originales, pintura y pivotes; incorpora 45 piezas de habitáculo (asientos, volante, instrumentos y consola), reflejos neutros precalculados y un acabado que conserva el rojo. El tablero es una interpretación del juego, no una reproducción certificada del fabricante. El piso oscuro aprobado se mantiene para ocultar la superficie pintada bajo el habitáculo. Fuente editable: `tools/blender/selected-sources/ferrari-california-t-art-v11.blend`; proceso reproducible: `tools/blender/refine-ferrari-cockpit.py`, partiendo del GLB aprobado de `3de9b8b`.

Las sombras de contacto proyectadas de los cuatro autos usan una sola llamada de dibujo y ocho triángulos; no son ray tracing. El paddock y la tribuna de Suzaka se orientan según la pista actual y conservan más de doce metros de separación respecto al borde del asfalto; no se elimina la geometría aprobada.

El audio conserva los controles y volumen del jugador, recupera el crecimiento con RPM y evita invertir energía en subgraves poco audibles. La envolvente final mantiene margen bajo clipping y se verifica después del mastering, con una prueba WebAudio determinista adicional. Lamborghini y Jesko tienen perfiles de cilindros propios y Yangwang no recibe pulsos de combustión, incluido su uso como rival. La salida sigue sin música y la celebración mantiene su control independiente.

`docs/quality/v11/REPORT.md` detalla comprobaciones y límites. Las capturas y WAV comparativos se conservan en el artefacto `horizon-art-audio-evidence`. La incorporación de grabaciones automotrices licenciadas, el refinamiento individual de los otros seis interiores y la certificación de 60 FPS en la laptop siguen pendientes.
