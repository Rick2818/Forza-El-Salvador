# Migración a Netlify — Guía paso a paso

Fecha: 2026-11-05 · Tiempo estimado: 10 minutos · Costo: Gratis

Este documento te dice exactamente qué hacer para mover tu sitio de Vercel a Netlify
y que el formulario guarde los leads en Airtable.

---

## Antes de empezar
Asegúrate de tener:
- Tu cuenta de GitHub (donde está el repo `Rick2818/Boltech-Group`)
- Tu base de Airtable creada (ver `AIRTABLE-SETUP.md`)
- Los 3 datos de Airtable anotados (API Key, Base ID, Table Name)

---

## Paso 1: Crear cuenta en Netlify
1. Ve a https://www.netlify.com
2. Regírate con tu cuenta de GitHub (más rápido)
3. Confirma tu correo si te lo piden

## Paso 2: Conectar tu sitio
1. En el dashboard de Netlify, haz clic en **"Add new site"** → **"Import an existing project"**
2. Selecciona **GitHub**
3. Busca el repositorio `Rick2818/Boltech-Group`
4. Selecciona la rama **`feat/site-mejora-comercial`**
5. Configuración de build:
   - Build command: deja en blanco o pon `echo 'skip'`
   - Publish directory: pon `.` (un punto, significa la raíz)
   - Haz clic en **Deploy site**

## Paso 3: Configurar variables de entorno
1. En tu sitio de Netlify, ve a **Site settings** → **Environment variables**
2. Añade estas 3 variables (una por una):

| Variable | Valor |
|----------|-------|
| `AIRTABLE_API_KEY` | `pat...` (tu clave de Airtable) |
| `AIRTABLE_BASE_ID` | `app...` (el ID de tu base) |
| `AIRTABLE_TABLE_NAME` | `Leads` |

3. Haz clic en **Save**

## Paso 4: Ver que funciona
1. Netlify te dará una URL como `https://tu-sitio.netlify.app`
2. Abre esa URL en tu navegador
3. Ve a `/solicitud` y llena el formulario con consentimiento
4. Deberías ver "Solicitud registrada"
5. Revisa tu correo `ricardo.boltechgroup@gmail.com` — debería llegar el aviso
6. Revisa tu tabla en Airtable — debería aparecer el registro nuevo

---

## Si algo falla
- **El formulario dice error:** Revisa que las 3 variables de entorno estén bien escritas en Netlify.
- **No llega el correo:** Revisa tu bandeja de spam. El endpoint sigue funcionando aunque falle Airtable.
- **No aparece en Airtable:** Verifica que la tabla se llame exactamente `Leads` y que la API Key sea correcta.

---

## Volver a Vercel (cuando quieras)
Cuando se levanten los 30 días de bloqueo de Vercel, puedes volver a subir ahí sin problema. Tu código en GitHub no cambia.
