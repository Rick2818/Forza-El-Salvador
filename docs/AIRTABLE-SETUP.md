# Airtable — Configuración para Boltech Group

Fecha: 2026-11-05 · Tiempo estimado: 5 minutos · Costo: Gratis

## Paso 1: Crear cuenta
Ve a https://airtable.com y crea una cuenta gratuita (puedes usar Google para entrar rápido).

## Paso 2: Crear la base
1. Haz clic en **"Add a base"** → **"Start from scratch"**
2. Ponle nombre: **Boltech Leads**
3. Te aparecerá una tabla llamada "Table 1". Cambiale nombre a: **Leads**

## Paso 3: Crear las columnas
En la tabla, borra las columnas que sobren y deja solo estas (una por una):

| Nombre de columna | Tipo de campo |
|-------------------|---------------|
| Nombre | Texto largo |
| Correo | Correo electrónico |
| Empresa | Texto largo |
| Cargo | Texto largo |
| Tarea | Texto largo |
| Activo | Texto corto (pedidos, facturas, stock, general) |
| Idioma | Texto corto (es, en) |
| Fuente | Texto corto (web_solicitud, web_advisor) |
| Página | Texto largo |
| Consentimiento | Casilla de verificación |
| Fecha consentimiento | Fecha |
| ID solicitud | Texto corto |
| Fecha creación | Fecha (automática) |

## Paso 4: Obtener tu API Key
1. Haz clic en tu foto de perfil (arriba a la derecha) → **Account**
2. Busca **API key** → Copia la clave (empieza por `pat...`)
3. Guárdala en un lugar seguro. **No la compartas con nadie.**

## Paso 5: Obtener tu Base ID
1. Abre tu base **Boltech Leads**
2. Mira la URL en el navegador. Se ve así:
   `https://airtable.com/appXXXXXXXXXXXXXX/tblXXXXXXXXXXXXXX/viwXXXX...`
3. El texto después de `app` y antes de la primera `/` es tu **Base ID** (empieza por `app`)
4. Ejemplo: si la URL es `https://airtable.com/appAbCd1234EfGhIj/tbl...`, tu Base ID es `appAbCd1234EfGhIj`

---

## Paso 6: Anota estos tres datos (los necesitarás después)
Escribe en un papel o bloc de notas:

```
AIRTABLE_API_KEY = patXXXXXXXXXXXXXXXXXXXX
AIRTABLE_BASE_ID = appXXXXXXXXXXXXXX
AIRTABLE_TABLE_NAME = Leads
```

---

## ¿Y si me equivoco?
No pasa nada. Puedes borrar la base y crear otra en 2 minutos. Airtable es gratis para hasta 1,000 registros, que es más que suficiente para empezar.

---

Siguiente paso: cuando quieras subir el sitio a otro host, usa el archivo `MIGRACION-GUIA.md` que está junto a este.
