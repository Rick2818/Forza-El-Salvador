# Forza Horizon 6 — referencia de circuitos y torneos

**Fecha:** 16 de noviembre de 2026
**Uso:** insumo de diseño para *Horizon El Salvador* (nuestro juego propio). Nada de este documento se copia al juego: no usamos nombres, coches, marcas ni trazados de Forza. Sirve para entender **qué estructuras de evento funcionan** y decidir cuáles nos conviene reconstruir con contenido original.

---

## 0. Regla de lectura

- **Hecho observado**: aparece en fuente de Playground Games / forza.net, o en la tabla oficial del Festival Playlist. Se cita.
- **Propuesta de diseño**: idea nuestra para Horizon El Salvador. No es una afirmación sobre Forza.

Fuentes primarias usadas:

1. `forza.net/news/forza-horizon-6-progression` — «Meet the Three Pathways of Progression in Forza Horizon 6», 12 de mayo de 2026.
2. `forza.net/news/forza-horizon-6-features` — «10 Incredible New Features Coming to Forza Horizon 6», 9 de febrero de 2026.
3. `forza.net/fh6playlists` — tabla oficial del Festival Playlist (Series 01–07, con nombre de evento, tipo, disciplina, clase y rutas).
4. Forza Wiki (`forza.fandom.com/wiki/Forza_Horizon_6`) — tipos de evento nuevos y retorno de Eliminator / Hide & Seek.

---

## 1. Ficha observada

| Dato | Valor | Fuente |
|---|---|---|
| Localización | Japón (Horizon Festival Japan) | forza.net features |
| Escenarios citados | Shibuya Crossing, Ginko Avenue, Tokyo Tower, C1 loop, Mt. Haruna, Bandai Azuma | forza.net features |
| Lanzamiento | 19 de mayo de 2026 (Xbox Series X\|S y PC); Early Access 15 de mayo | forza.net features |
| PS5 | «later this year» según el blog de mayo de 2026 | forza.net progression |
| Estaciones | Vuelven, con variación «más dramática que en México»; nieve todo el año en la región alpina con neumáticos de nieve | forza.net features |
| Progresión | Wristbands (7), Stamps (7), Horizon Play con nivel propio | forza.net progression |

---

## 2. Disciplinas de ruta observadas

El Festival clasifica los eventos oficiales en **Road, Dirt y Cross Country**, cada uno con temas de coche especializados; a ello se suman **Street** y **Touge** (mencionados en la ruta de Stamps) y los formatos nuevos de meetup.

| Disciplina | Qué es | Formatos vistos en la tabla oficial |
|---|---|---|
| Road | Asfalto, circuito cerrado | `Circuit`, `Sprint` |
| Street | Asfalto urbano / nocturno, sin circuito cerrado | `Run`, `Charge`, `Chase`, `Climb`, `Descent` |
| Dirt | Tierra / rally | `Scramble`, `Trail` |
| Cross Country | Campo a través, vehículos todoterreno | `Cross Country`, `Cross Country Circuit` |
| Touge | Duelo en puerto de montaña | usado por el modo Touge Showdown |

Ejemplos reales de nombres por disciplina (tabla oficial del playlist):

- **Road**: *Electric Town Circuit*, *Coastline Sprint*, *Ito Sprint*, *Soni Circuit*, *Highway Circuit*, *Hokubu Circuit*, *Edo Circuit*, *Tokyo Railway Sprint*.
- **Street**: *Nachi Run*, *River Descent*, *Daikoku Chase*, *Matsumi Climb*, *Tokyo City Docks Charge*, *Kita Ine*, *Sunflower Charge*, *Rainbow Bridge Descent*, *Norikura Descent*, *Hokubu Ascent*.
- **Dirt**: *Hirosaki Scramble*, *Hokubu Trail*, *Waterfall Trail*, *Nukabira Trail*, *Kinkaku-ji Trail*, *Cherry Field Trail*, *Airfield Trail*.
- **Cross Country**: *Stadium Cross Country Circuit*, *Edogawa Cross Country Circuit*, *Nangan Cross Country Circuit*, *Ruriko-ji Cross Country*, *Wind Farm Cross Country*, *Tateyama Alpine Cross Country*.

**Lectura de diseño:** el nombre de la ruta ya codifica disciplina + formato. `Circuit` cierra el bucle; `Sprint` es punto A→B; `Scramble`/`Trail` son trazados de tierra; `Charge`/`Chase`/`Run` son urbanos. Eso resuelve un problema real de nuestro juego: hoy hay **un solo circuito** y ningún vocabulario para nombrar variantes.

### Eventos que no son carrera

| Evento | Descripción observada | Fuente |
|---|---|---|
| **Time Attack Circuits** | Nuevos. Circuitos repartidos por Japón; se pasa por el pórtico y se marca la vuelta más rápida. Cualquier coche, créditos y XP por vuelta. Integrados en el mundo compartido sin pantallas de carga | features |
| **Drag Meets** | Arrancones en el mundo abierto, 12 plazas por meetup | features |
| **Car Meets** | Tres ubicaciones: Horizon Festival, aparcamiento de Okuibuki (Alpes) y Daikoku | features + wiki |
| **PR Stunts** | Stunts clásicos de la saga (trampas de velocidad, saltos, zonas de derrape) | progression |
| **Bonus Boards** | Coleccionables | progression |
| **Horizon Rush** | **Nuevo**: circuitos de obstáculos, p. ej. en Tokyo City Docks | features / wiki |
| **Showcase Events** | Clásicos; funcionan como «Wristband Event» | progression |
| **Goliath** | La carrera más larga de la saga, en Legend Island, requiere el Wristband de oro | progression |

---

## 3. Torneos y estructura de progresión observada

### 3.1 Wristbands (pulseras) — 7 en total

- Gate de **clase de coche**: cada pulsera desbloquea eventos con restricciones más altas.
- La primera exige completar *Horizon Qualifiers* + *Horizon Invitational*.
- Los **Wristband Events** mezclan Showcase Events clásicos con Horizon Rush nuevos: hay que completarlos para subir de pulsera.
- La pulsera de oro abre **Legend Island** y con ella el Goliath.
- Tras completar una carrera por primera vez se desbloquea el **Race Customizer** para esa carrera (cualquier coche del garaje + ajustes).

### 3.2 Stamps (sellos) — 7 en total

Progresión paralela de exploración: coches, murales, mascotas, puntos de interés, tours, Street y Touge, el trabajo de reparto *Raku-Raku*, etc. Desbloquean rumores de **Barn Finds** y viviendas.

### 3.3 Festival Playlist — la estructura de «temporada»

Serie → 4 estaciones (Summer / Autumn / Winter / Spring) → por estación, campeonatos y desafíos.

Reglas observadas en la tabla oficial:

- Un **Championship** vale 5 puntos y consta de **3 rutas**.
- Cada championship impone **tipo de coche + clase** (p. ej. «Retro Hot Hatch — C Class», «Modern Supercars — S1 Class»).
- Además de campeonatos hay tareas de **Horizon Play** (p. ej. «Complete a Horizon Racing Championship», «Complete a Spec Racing Championship») y recompensas de coleccionable (bocinas, créditos).
- Las Series vistas: *S01 Welcome To Japan*, *S02 Horizon Decades*, *S03 Italian Exotics*, *S04 Horizon Mascot Party*, *S05 British Automotive*, *S06 Horizon Meets*, *S07 City Life*.

### 3.4 Horizon Play — modos competitivos

| Modo | Regla observada |
|---|---|
| **The Eliminator** | Battle royale en mundo abierto |
| **Hide & Seek** | Persecución: el escondido debe mantenerse oculto |
| **Touge Showdown** | Campeonato **1 contra 1**, a **tres carreras** |
| **Spec Racing** | **Todos con coches de serie**: solo decide la habilidad |
| Horizon Racing | Free-for-all estándar |
| Horizon Drift | Derrape free-for-all |
| Custom Racing / Custom Drifting | Matchmaking con clase y tipo de carrera / tipo de conducción elegidos |

- Nivel propio hasta 100, con **Badge cada 10 rangos**.
- **Series Standing Leaderboards** por modo, que se **reinician al empezar cada Serie**.
- Crossover: cada nivel de Horizon Play hasta 25 otorga **Festival Points** para la siguiente pulsera.

### 3.5 EventLab y CoLab

EventLab permite crear y compartir circuitos; **CoLab** lleva la construcción cooperativa al mundo abierto con **hasta 12 jugadores**.

---

## 4. Qué de todo esto encaja en Horizon El Salvador

Estado real de nuestro motor (verificado en código y en navegador): **un** circuito procedural cerrado, 3 vueltas, 3 rivales con el mismo modelo de coche, HUD con velocidad/marcha/vuelta/mejor vuelta, audio procedural, MCP Pitstop como fuente de datos externa, sin persistencia (REA confirma **0 almacenamiento**).

### 4.1 Implementable ya, con poco trabajo

| Concepto | Cómo se hace en nuestro motor | Coste |
|---|---|---|
| **Time Attack** | Reutilizar el bucle de carrera con `laps = 1`, cronómetro por vuelta y «mejor vuelta» ya existente en el HUD. El pórtico de meta **ya está construido** en `world/track.ts` | Bajo |
| **Spec Racing** | Los 3 rivales ya usan el mismo `car-body-rival.glb` y la misma física: es cuestión de etiquetar el modo y fijar el setup | Bajo |
| **Championship de 3 rutas** | Requiere 3 trazados distintos; hoy `track.ts` tiene una lista fija de segmentos. Parametrizar esa lista es el cambio clave | Medio |
| **Series / estaciones** | Agrupar campeonatos en una estructura de datos y mostrarla en el menú; sin premios inventados | Bajo (UI) |
| **Vocabulario de rutas** | Adoptar la nomenclatura `Circuito` / `Sprint` / `Tramo` / `Scramble` / `Descenso` / `Ascenso` para nombrar variantes | Trivial |

### 4.2 Implementable, pero exige persistencia

| Concepto | Nota |
|---|---|
| **Wristbands / Stamps** (progresión) | Necesita `localStorage`. REA confirma que hoy no hay ninguno. Es local, no toca pagos ni datos de clientes |
| **Leaderboards locales** | Mismo caso: récord por circuito en el navegador |
| **Race Customizer** | Clase de coche simulada por parámetros (masa, par, agarre) sobre un único modelo |

### 4.3 Necesita mundo abierto y no encaja ahora

| Concepto | Por qué no |
|---|---|
| **Eliminator / Hide & Seek** | Requieren multijugador en un mundo abierto persistente; no hay netcode |
| **Touge Showdown 1v1** | El 1 contra 1 sí es posible contra IA, pero «dos jugadores» exige red |
| **PR Stunts / Drag Meets / Car Meets** | Presuponen mundo abierto con puntos dispersos; nuestro juego es circuito cerrado |
| **Horizon Rush** | Es un circuito de obstáculos: factible como *variante* de circuito con rampas, no como mundo abierto |
| **EventLab / CoLab** | Editor de circuitos + cooperación: proyecto aparte |

### 4.4 Riesgo de copiar de más

No usamos: nombres de rutas de Forza, modelos de coche, libreas, marcas, ni el trazado de circuitos reales. La nota del menú («contenido original · sin activos de terceros») es un compromiso, no una frase decorativa.

---

## 5. Propuesta concreta: Serie 1 de Horizon El Salvador

Estructura calcada de la **forma** del Festival Playlist (Serie → 4 estaciones → campeonatos de 3 rutas de 5 puntos), con nombres y trazados propios.

### 5.1 Nomenclatura

`Circuito` (bucle cerrado asfaltado) · `Sprint` (A→B asfaltado) · `Descenso` / `Ascenso` (urbano con desnivel) · `Tramo` (tierra) · `Scramble` (tierra revirada) · `Ruta` (campo a través mixto).

### 5.2 Serie 1 — «Costa y Volcán»

| Estación | Campeonato | Restricción | Rutas |
|---|---|---|---|
| Seca | *Litoral* | Tracción trasera, clase C | Circuito La Libertad · Sprint El Bálsamo · Descenso Panchimalco |
| Lluvia | *Cafetal* | Clase B, todo terreno | Tramo Volcán · Sendero Café · Scramble Ilopango |
| Noche | *Puerto* | Clase A, asfalto | Carga del Puerto · Ascenso Los Chorros · Circuito Acajutla |
| Viento | *Cumbre* | Clase S1, libre | Ruta de las Flores · Tierra Cerro Verde · Circuito Mirador |

Además, tres eventos sueltos del tipo que el Festival usa como variante:

- **Time Attack** — *Mirador El Boquerón*: una vuelta, mejor tiempo, cualquier coche.
- **Spec** — *Duelo de Serie*: los cuatro coches idénticos.
- **Rush** — *Muelle Acajutla*: circuito con rampas y conos.

### 5.3 Orden de implementación sugerido

1. Parametrizar `world/track.ts` para aceptar una definición de trazado (lista de segmentos) en vez de una constante.
2. Definir 4–6 trazados con datos y exponerlos en el menú.
3. Modo Time Attack sobre el circuito 1 (una vuelta, mejor vuelta).
4. Estructura Serie → estación → campeonato de 3 rutas en el menú, sin premios inventados.
5. Persistencia local de mejores vueltas y progreso (solo `localStorage`).
6. Rampas y conos para el evento tipo Rush.

---

## 6. Resumen ejecutivo

Lo que Forza Horizon 6 enseña y nos sirve: **una carrera no es un evento, es una pieza dentro de un campeonato de tres carreras, dentro de una estación, dentro de una serie**; el nombre de la ruta ya dice disciplina y formato; y el juego ofrece tres puertas de entrada distintas (campaña con pulseras, exploración con sellos, competitivo con Horizon Play).

Lo que no podemos tomar: los modos que dependen de mundo abierto persistente y multijugador (Eliminator, Hide & Seek, CoLab, PR Stunts dispersos). Nuestra ventaja es que un circuito procedural parametrizable puede generar las variantes que allí son rutas artesanales, y el Time Attack encaja casi sin trabajo porque el pórtico y el cronómetro de vuelta ya existen.
