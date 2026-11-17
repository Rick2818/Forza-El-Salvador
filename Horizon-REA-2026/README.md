# Horizon El Salvador

Videojuego original de carreras 3D para Chrome. Three.js + TypeScript + Vite + Rapier.
El arte de la carrera es procedural (texturas Canvas2D, coches y circuito generados por código):
no se importan mallas, texturas ni datos de Forza Horizon ni de ningún otro juego.

## Garaje: selección de Rick

El menú inicial incluye **Garaje · 7 autos**, con la selección de vehículos,
sus acabados y las fotografías aportadas para modelado. Las fotos pueden abrirse
a tamaño completo. La ficha del Ferrari todavía no tiene fotografía adjunta.

| Vehículo | Referencia visual |
| --- | --- |
| Ferrari California T | Rojo; ficha California T 2015 existente |
| Yangwang U9 | Rojo y negro; archivo identificado como Xtreme, versión por verificar |
| Koenigsegg Jesko Odin | Carbono negro y detalles dorados |
| Bugatti Chiron | Negro y cobre |
| Porsche 911 | Gris; posible Turbo S, por verificar |
| Lamborghini Aventador Roadster | Azul claro, techo abierto; versión por verificar |
| Mercedes-AMG GT Black Series | Rojo, configuración Safety Car F1 |

**Estado:** incorporados como referencias en el garaje. Los siete modelos 3D
individuales siguen pendientes de construcción y validación; la carrera usa
el prototipo procedural. Las fotografías no son modelos 3D y no cambian la física.

El registro está en `src/vehicle/roster.ts`; las fotografías, en
`public/vehicles/references/`. Procedencia e integridad:
[`docs/vehicle-fidelity/selected-references.json`](docs/vehicle-fidelity/selected-references.json).

## Requisitos

- Node.js 20+
- Chrome con WebGL2
- Windows / macOS / Linux

## Ejecutar

```powershell
$P = "C:\Users\Ricardo\Documents\Boltech Group\Plan Comercial tipo Relevance AI\Horizon-REA-2026"
npm --prefix $P install
npm --prefix $P run dev
```

Abrir `http://localhost:5173/` en Chrome y pulsar **Iniciar carrera**
(o simplemente W / S / Enter / Espacio).

Build de producción:

```powershell
npm --prefix $P run build
npm --prefix $P preview
```

## Controles

| Acción | Teclas |
|---|---|
| Acelerar | `W` / `↑` |
| Frenar / marcha atrás | `S` / `↓` |
| Girar | `A` `D` / `←` `→` |
| Freno de mano | `Espacio` |
| Pausa | `Esc` / `P` |
| Cámara persecución / capó | `C` |
| Devolver coche a pista | `R` |
| Silenciar | `M` |

## Contenido

- Circuito cerrado de 1.94 km con rectas, curvas, bordillos, muros, pórtico de salida y boxes.
- Coche deportivo procedural con pintura PBR, cristales, faros, llantas de 10 radios y pinzas.
- Física Rapier: suspensión por raycast, 6 marchas automáticas, curva de par, drag, downforce.
- 3 rivales con IA pure-pursuit, vueltas, posiciones y mejores tiempos.
- HUD con velocímetro, tacómetro, marcha, vuelta, tiempos y minimapa.
- Menú de inicio, pausa, resultados, audio procedural y sistema de humo.
- Calidad gráfica adaptable (alta / equilibrada) según FPS.

## Estructura

```
src/
  core/      input, ajustes, matemáticas
  sim/       kernel de física del vehículo (matemática pura, testeable)
  vehicle/   coche procedural, física, IA
  world/     circuito, entorno, texturas procedurales
  race/      carrera, vueltas, clasificación
  render/    cámara, humo
  ui/        HUD, menús
  audio/     motor procedural (WebAudio)
rea-lab/     artefacto JS original analizado con REA
scripts/     resolución y validación numérica del trazado
```

## Verificación

- `npm test` — pruebas del kernel de física.
- `npm run build` — `tsc --noEmit` + bundle de producción.
- Telemetría en vivo desde la consola de Chrome:

```js
HORIZON.stats()
```

Devuelve estado, FPS, velocidad, marcha, RPM, posición, draw calls, triángulos
y el estado de las cuatro ruedas (contacto, longitud y fuerza de suspensión).

## Evidencia REA

El análisis estático real (IDs de evidencia, hashes, métricas y limitaciones) y el
diagnóstico del bug de física están documentados en [`REA-EVIDENCE.md`](REA-EVIDENCE.md).

## Estado conocido

- Física estable: 0–100 km/h en ~6 s, altura 0.52 m, sin vuelcos.
- Rendimiento: 30–37 FPS en Intel Iris Xe a 800×526. Pendiente optimización para 1080p.
- Escenografía diurna actual; la versión nocturna cinematográfica está pendiente.
