# Decisiones técnicas — 21 noviembre 2026

- Se conserva Three.js 0.187.0, Rapier 0.21.0, Vite 8.3.8, Vitest 5.1.0 y TypeScript 7.0.2 del lockfile existente. No hay nuevas dependencias de producción.
- WebGPURenderer/TSL se evaluaron mediante la documentación oficial: https://threejs.org/manual/pages/webgpurenderer . Tiene backend WebGPU y fallback WebGL2, pero migrar materiales, consultas GPU, capturas y la ruta de render sin un beneficio medido aumentaría el riesgo. No se migra en esta entrega.
- Blender 5.3.0 estable fue verificado en https://www.blender.org/download/ y https://www.blender.org/releases/5-3/ (publicación 10 noviembre 2026). El ejecutable disponible aquí es 4.3.2. No se atribuye ningún modelo o render a Blender 5.3 ni se reexportan modelos aprobados sin necesidad.
- GLB, batching estático, instancias y escalado adaptativo existentes se conservan. Meshopt/Draco/KTX2 quedan como experimentos posteriores con comparación del tamaño, carga y fidelidad visual, no como dependencias añadidas por moda.
- Se reutilizan vectores en Vehicle para eliminar las asignaciones temporales de Vector3/Quaternion de sus cálculos por paso. Esto reduce presión sobre GC; no constituye por sí solo una medición de ganancia de FPS.
- Los tres autos adicionales se cargan al seleccionarlos; una selección recordada se carga al arrancar. La parrilla mantiene cuatro participantes y tres rivales para conservar el presupuesto físico/gráfico.
- Los anuncios permanecen conceptuales; no se crea ni afirma patrocinio oficial, autorización comercial de marcas o monetización.
