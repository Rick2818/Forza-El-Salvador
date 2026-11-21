# Horizon El Salvador

Videojuego de carreras 3D para Chrome. Código TypeScript, renderizado Three.js r187, física Rapier y construcción con Vite. Vehículos GLB, talleres y pinos editables en Blender; texturas de pista y otros elementos generados por el proyecto.

Repositorio: **Rick2818/Forza-El-Salvador**. Juego publicado: https://rick2818.github.io/Forza-El-Salvador/

## Estado al 21 de noviembre de 2026

| Área | Estado |
| --- | --- |
| Versión aprobada | Integrada en `main`, merge `66ba205`; publicación automática mediante GitHub Actions |
| Revisión de calidad | [PR #6](https://github.com/Rick2818/Forza-El-Salvador/pull/6), aprobado e integrado |
| Validación | 104 pruebas y compilación; seis carreras físicas completas; capturas WebGL y controles aprobados en Actions `44917119620` |
| Aprobación del usuario | Visual y audio aprobados el 21 de noviembre de 2026 |
| 60 FPS en la laptop | Objetivo pendiente de comprobar; no es una medición obtenida |
| Fidelidad artística | En revisión; algunos vehículos y sonidos aún necesitan refinamiento |

Las capturas proceden del motor real del juego, no de fotografías de referencia. Las imágenes de revisión con la leyenda **CAPTURA** usan poses y pasos controlados; no son un contador de FPS medidos. Los circuitos son trazados originales inspirados en disciplinas de automovilismo, sin afiliación con los autódromos reales ni con Forza.

## Autos, pistas y dificultades

Solo cuatro autos activos:

- Ferrari California T: material rojo cereza aprobado, opaco, con barniz suave.
- Porsche 911: grafito oscuro y pinzas amarillas.
- Bugatti Chiron: negro y cobre.
- Mercedes-Benz AMG GT Black Series: rojo, configuración visual Safety Car.

Solo dos circuitos seleccionables:

- **Monzón:** noche, estrellas, asfalto negro, farolas y cuatro talleres abiertos con emblemas de cada marca; herramientas, llantas y motores visibles.
- **Suzaka:** día, trazado en ocho con puente, pinos de tronco largo y copas con ramas/agujas, terreno ondulado y montañas al fondo.

Cada carrera tiene un jugador, tres rivales físicos y tres vueltas. **Fácil, Medio y Difícil** cambian ritmo, reacción y presión de adelantamiento. Los rivales frenan según el trazado, buscan espacios y disputan la punta usando los mismos coches físicos. Los parámetros son ajustes del videojuego, no prestaciones reales homologadas.

La salida automática comparte el reloj de carrera entre rojo, amarillo y verde. Los cuatro autos permanecen detenidos hasta el verde. La salida es completamente silenciosa musicalmente; al finalizar la carrera se activa una celebración sonora original o el archivo local seleccionado por el jugador; los motores del jugador y los rivales se sintetizan con Web Audio. Motores/neumáticos y música tienen controles separados; `M` silencia el conjunto. No se presentan estos perfiles como grabaciones de los motores originales.

## Publicidad conceptual en los dos circuitos

La revisión de partners incorpora **Aramco, AWS, DHL, Heineken, Lenovo, LVMH, MSC Cruises, Pirelli, Qatar Airways y Salesforce** tanto en Monzón como en Suzaka. Cada nombre aparece dos veces por vuelta, en vallas 3D más allá de las barreras de seguridad. El planificador evita los boxes, la tribuna de Monzón, el cruce de Suzaka y los puntos elevados sin soporte en terreno. Usa un solo atlas de texturas de Canvas, un lote de carteles y soportes instanciados para controlar el coste gráfico.

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

`npm test` cubre materiales, selección de cuatro autos, pivotes, conservación de geometría al agrupar mallas, pinzas de freno, física Rapier, seis carreras de tres vueltas, niveles de dificultad, salida sincronizada, cronómetro, audio y registro de rendimiento. En Node se sustituye la decodificación de imágenes, conservando el análisis real de GLB, geometría, materiales y física.

Las seis carreras usan un conductor de prueba automático para el jugador. La segunda pasada registra cambios de líder sostenidos durante al menos 1,5 segundos: Monzón **3/2/3**, Suzaka **4/4/3** en Fácil/Medio/Difícil; todos terminan y no necesitan recolocación de emergencia. Los resultados se guardan en `review/quality/race-validation.jsonl` dentro del artefacto de Actions. Estas simulaciones no equivalen a una prueba de FPS ni a una validación humana de la conducción.

Pruebas de velocidad máxima en un plano, 180 segundos de simulación: Ferrari **205,0 mph**, Porsche **205,0 mph**, Bugatti **234,6 mph**, Mercedes **202,0 mph**. No significa que cada recta permita alcanzar esos máximos.

La tarea `.github/workflows/monzon-garages-review.yml` ejecuta pruebas y compilación, abre Chrome con WebGL/SwiftShader y genera:

- `review/quality/`: recta, curva, chicana, boxes, puente, pinos y vistas de los cuatro autos en ambos circuitos; métricas de cada captura y resultados de carrera.
- `review/garages/`: talleres, interior, vista de conducción, señales roja/amarilla/verde, silencio de salida y comprobación de celebración al finalizar.

El artefacto **monzon-garages-review** permite revisar la rama sin publicar Pages. Los archivos de `review/` se generan durante la verificación; no se confunden con fotografías de referencia.

## Medir rendimiento de verdad

La física usa pasos fijos de **60 Hz**. Ese número no representa los FPS gráficos.

1. Probar la versión que se desea evaluar en la laptop, con Chrome enfocado y conectado a corriente.
2. Anotar CPU/GPU, resolución de pantalla y calidad; correr con los cuatro autos.
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
