# Mejora del sitio real — boltech-group.vercel.app

Estado: `READY_TO_APPLY` · Preparado: 2026-11-05 · **No desplegado**
Origen auditado: `Rick2818/Boltech-Group` (público) y el sitio en producción.

Este paquete no reemplaza el sitio. Añade lo que el plan comercial exige y hoy no existe:
**un formulario que registra el consentimiento, páginas legales propias y la primera puerta de
operaciones**.

---

## Qué hay aquí

| Archivo | Qué es | Ruta final |
|---|---|---|
| `solicitud.html` | Formulario de 6 campos + consentimiento, bilingüe, con envío a `/api/lead` | `/solicitud` |
| `privacidad.html` | Aviso de privacidad completo, ES/EN | `/privacidad` |
| `retiro.html` | Cómo retirar el consentimiento, ES/EN | `/retiro` |
| `conservacion.html` | Plazos de conservación, ES/EN | `/conservacion` |
| `home-operaciones.html` | Sección de las 3 tareas para insertar en `index.html` | dentro de `/` |

`vercel.json` ya tiene `cleanUrls: true`, así que `privacidad.html` responde en `/privacidad`.
No hace falta tocar rutas.

---

## Cómo aplicarlo

### 1. Copiar las páginas

Copia los cuatro `.html` a la raíz del repositorio `Boltech-Group`, junto a `index.html`.

### 2. Insertar la sección de operaciones

En `index.html`, pega el contenido de `home-operaciones.html` justo **después** del cierre de
`</section>` de `#solutions` y **antes** de `<style id="specialist-premium-style">`.

No requiere CSS nuevo más allá del bloque incluido.

### 3. Cambiar los llamados a la acción

En `index.html`, reemplaza el destino de los botones que hoy van a `#contact` o a `mailto:`:

| Dónde | Antes | Después |
|---|---|---|
| Hero, botón secundario | `href="#contact"` | `href="/solicitud"` |
| Tarjeta PILOT | `href="#contact"` | `href="/solicitud?tarea=general"` |
| Tarjeta CUSTOM | `href="#contact"` | `href="/solicitud?tarea=general"` |
| Sección de contacto, botón principal | `mailto:ricardo.boltechgroup@gmail.com?subject=...` | `href="/solicitud"` |

El `mailto` puede quedarse como alternativa en el pie, pero no como única vía.

### 4. Registrar el consentimiento en `api/lead.js`

Hoy `api/lead.js` acepta `email`, `companyName` y `painPoint`, y **no exige consentimiento**.
El formulario envía además `consent`, `consentText`, `consentAt`, `contactName`, `jobTitle`,
`source`, `assetId`, `language` y `pageUrl`.

Añade este bloque **después** de validar el correo y **antes** de construir el registro:

```js
// El consentimiento es obligatorio: sin él no se registra ni se escribe al contacto.
if (req.body?.consent !== true) {
  return res.status(400).json({ ok: false, error: 'CONSENT_REQUIRED' });
}
const consentRecord = {
  granted: true,
  grantedAt: String(req.body?.consentAt || new Date().toISOString()).slice(0, 40),
  text: String(req.body?.consentText || '').slice(0, 300),
  source: String(req.body?.source || 'web_solicitud').slice(0, 60),
  assetId: String(req.body?.assetId || 'operaciones-general').slice(0, 60),
  pageUrl: String(req.body?.pageUrl || '').slice(0, 500),
  language: req.body?.language === 'en' ? 'en' : 'es'
};
// Incluye consentRecord en el mismo registro que guardes (Airtable, Supabase, hoja).
// No guardes la IP en claro: si la necesitas para prueba de consentimiento, guárdala hasheada.
```

Y añade al mensaje interno de Telegram una línea con `assetId` y la fecha de consentimiento, para
que el seguimiento humano sepa de qué tarea viene.

**Importante:** el correo de confirmación al contacto no debe prometer nada que no esté en el
criterio de aceptación. El texto actual habla de "Solución de Proceso Lento"; conviene alinearlo
con la evaluación por escrito.

### 5. Actualizar el pie de página

Añade a los enlaces legales del pie:

```html
<a href="/privacidad">Privacidad</a> ·
<a href="/retiro">Retiro</a> ·
<a href="/conservacion">Conservación</a> ·
<a href="/solicitud">Solicitud</a>
```

Hoy el pie solo enlaza a `/gmail-privacy`, que cubre la integración de Gmail y **no** el
tratamiento de los datos del formulario.

### 6. Añadir las rutas al sitemap

```xml
<url><loc>https://boltech-group.vercel.app/solicitud</loc></url>
<url><loc>https://boltech-group.vercel.app/privacidad</loc></url>
<url><loc>https://boltech-group.vercel.app/retiro</loc></url>
<url><loc>https://boltech-group.vercel.app/conservacion</loc></url>
```

---

## Antes de publicar, confirmar

- [ ] **Destino real de los datos.** El aviso declara hoja de cálculo privada. Si el registro se
      hace en Airtable (como sugiere `/gmail-privacy`), actualizar el apartado 5 del aviso.
- [ ] Enlazar el aviso desde el checkbox (ya está en el formulario).
- [ ] Probar el envío con un correo propio y verificar que se registra el consentimiento.
- [ ] Probar el rechazo: sin casilla marcada, el envío no debe registrarse.
- [ ] Revisar que el correo de confirmación no incluya claims prohibidos.
- [ ] Quitar las notas internas marcadas en el HTML.

---

## Qué NO cambia

- No se toca el chat de especialistas ni sus endpoints.
- No se cambian precios ni la oferta.
- No se elimina ninguna página existente.
- No se publica nada sin autorización explícita.
