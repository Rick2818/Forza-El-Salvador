# Integración experimental de los siete vehículos

## Resultado comprobado

- Siete GLB independientes generados por Blender, con fuentes `.blend` comprimidas.
- Selector del garaje conectado a los modelos de la carrera y selección persistida.
- Carrocería completa importada, sin duplicar piezas del generador antiguo.
- Ruedas con pivotes independientes: dirección, suspensión y giro en Rapier.
- Dimensiones y ajustes de conducción por vehículo. Los ajustes son de videojuego;
  no constituyen una simulación certificada de prestaciones reales.
- U9 con sonido eléctrico sintetizado y una relación de transmisión experimental.
- Rivales con otras tres carrocerías. Reiniciar crea una parrilla nueva y retira
  los cuerpos/controladores y materiales de la sesión anterior.
- Rechazo explícito de GLB incompletos; los errores no activan una carrocería genérica.

## Validación

`npm run build`: TypeScript y Vite correctos. Advertencia existente de tamaño:
el bundle de JavaScript queda en aproximadamente 5.07 MB, incluyendo Rapier.

`npm test`: **38 pruebas correctas** en cinco archivos. Las pruebas de integración
cargan los GLB reales con GLTFLoader y simulan los siete vehículos en Rapier.
Se comprueban pivotes, geometría acotada, aceleración, dirección, giro de ruedas,
estabilidad sobre suelo plano y liberación de cuerpos al cambiar/reiniciar.
En Node solo se sustituye el decodificador de imágenes por un bitmap simulado;
estas pruebas no certifican texturas ni renderizado WebGL.

Blender generó seis vistas por vehículo (**42 PNG**), informes con hashes,
dimensiones, materiales, conteo de triángulos y batalla medida desde los pivotes.
La lámina `review/selected/contact-sheet.jpg` permite comparar los siete prototipos.
Los renders Workbench representan texturas por su color medio y no evalúan PBR.
Las cotas exteriores incluyen espejos y accesorios; no equivalen automáticamente
a la anchura de carrocería publicada sin espejos.

## Límites y trabajo de calidad restante

**No aprobado como reproducción final.** Las superficies y detalles son primeras
aproximaciones. Faltan el refinamiento de la identidad de cada modelo, ópticas,
interiores completos, juntas, geometría de parrillas y decoración específica.
La configuración Safety Car del AMG tiene una decoración simplificada. Las
versiones exactas del U9, Porsche y Aventador aún requieren confirmación.

No se completó la inspección visual del juego en navegador: Chromium no pudo
iniciarse en el entorno de ejecución; el navegador remoto no alcanza su localhost.
Por ello **no se certifican el recorrido visual de la interfaz ni 60 FPS**.
Las simulaciones de física y los renders Blender sí se ejecutaron.

No se fusiona ni despliega esta integración experimental. Producción y los
archivos comerciales ajenos a `Horizon-REA-2026` permanecen sin cambios.
