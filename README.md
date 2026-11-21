# Horizon El Salvador

Juego de carreras 3D para Chrome desarrollado en **Rick2818/Forza-El-Salvador** con TypeScript, Three.js, Rapier y elementos modelados en Blender.

**Jugar:** https://rick2818.github.io/Forza-El-Salvador/

## Estado del proyecto

- **Producción:** versión aprobada incorporada a `main` mediante el merge `66ba205`, el 21 de noviembre de 2026. GitHub Actions publica el sitio y permite comprobar el resultado del despliegue.
- **Revisión aprobada:** [PR #6](https://github.com/Rick2818/Forza-El-Salvador/pull/6), integrado.
- Los cambios de iluminación, pinos, talleres y competencia tienen aprobación visual y de audio del usuario. La revisión `ab1eae3` pasó 104 pruebas, compilación y capturas/controles en navegador (Actions `44917119620`).
- **Objetivo: 60 FPS en la laptop. Sigue pendiente medirlos en ese equipo.** Las capturas y simulaciones automáticas no certifican ese rendimiento.

## Contenido activo

| Autos | Circuitos | Carrera |
| --- | --- | --- |
| Ferrari California T, Porsche 911, Bugatti Chiron y Mercedes-Benz AMG GT Black Series | Monzón nocturno y Suzaka diurno | Cuatro autos, tres vueltas, Fácil / Medio / Difícil |

La revisión incorpora asfalto iluminado, garajes con emblemas y equipo de taller, pinos con tres niveles de detalle, montañas, cámara con anticipación, cronometraje corregido, rivales que adelantan y mezcla independiente de motores/música. Los modelos y sonidos continúan sujetos a evaluación artística; no se afirma calidad AAA alcanzada.

## Ejecutar y verificar

Recomendado: Node.js 22+, npm y Chrome con WebGL2.

```bash
cd Horizon-REA-2026
npm ci
npm test
npm run dev
```

Abrir `http://127.0.0.1:5173/`. Para compilar: `npm run build`.

La documentación completa está en [Horizon-REA-2026/README.md](Horizon-REA-2026/README.md): controles, arquitectura, Blender, pruebas, medición de FPS y publicación. La auditoría está en [QUALITY-AUDIT-2026-11.md](Horizon-REA-2026/docs/QUALITY-AUDIT-2026-11.md).

Este repositorio conserva archivos de otros proyectos históricos. Su documentación comercial anterior se preserva en [docs/legacy/PLAN-COMERCIAL-README.md](docs/legacy/PLAN-COMERCIAL-README.md); no corresponde al juego ni describe su estado actual.
