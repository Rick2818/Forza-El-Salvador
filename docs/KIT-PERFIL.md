# Kit de perfil — Freelancer y Upwork

**Fecha:** 13 de noviembre de 2026
**Objetivo:** dejar los dos perfiles presentables antes de gastar un peso en bids o Connects.

## 1. Diagnóstico verificado

Perfil Freelancer `ricardob971` (ID 95363726), skills declaradas hoy:

```
SEO · Node.js · Digital Marketing · Automation · API Development · API Integration
```

Evidencia del bloqueo: el proyecto 40816675 (spa en Austin) pide
`PHP, WordPress, HTML, Email Marketing, Mailchimp, WooCommerce, Customer Retention`
y el proveedor respondió `403 SKILLS_REQUIREMENT_NOT_MET`.

Con seis skills tan genéricas, la mayoría de los proyectos de automatización
quedan fuera de alcance técnico antes de que un humano lea la propuesta.

## 2. Skills a declarar

Regla: **solo lo que se pueda demostrar en una llamada o con un archivo**. Cada
una de estas tiene respaldo en el código de este repositorio.

| Skill | Respaldo verificable |
|---|---|
| Node.js | todo el motor y las funciones de Cloudflare |
| API Development | `functions/api/*` con autenticación, validación y recibos |
| API Integration | conectores Upwork/Freelancer, MCP, Airtable, Supabase REST |
| Automation | colas durables en Supabase, cron de 5 minutos, reintentos |
| AI Agents | cadena Gemini → Groq → Workers AI con herramientas y límites |
| AI Chatbot | función de WhatsApp Cloud API y bot de Telegram |
| LLM Integration | proveedores múltiples con respaldo y degradación controlada |
| Supabase | migraciones, RPC con `FOR UPDATE SKIP LOCKED`, permisos por rol |
| Cloudflare Workers | Pages Functions, Worker programado, KV |
| WhatsApp API | webhook de Meta con verificación y consentimiento |
| Telegram Bot | webhook y secreto de validación |
| n8n | flujos de contenido y automatización descritos en los playbooks |

**No declarar** (sin respaldo real hoy): PHP, WordPress, WooCommerce, Mailchimp,
SolidWorks, Flutter, diseño gráfico, edición de audio.

Declarar eso abre proyectos que después no se pueden entregar. En Freelancer eso
termina en disputa y en la primera reseña negativa, que es peor que no tener
reseñas.

## 3. Titular del perfil

Freelancer (inglés, 60–70 caracteres):

```
AI Automation & API Integration | Node.js, n8n, WhatsApp bots
```

Alternativa si se quiere competir por proyectos de agentes:

```
I build AI agents and automations that run 24/7 without a team
```

## 4. Resumen del perfil (inglés)

```
I build automation systems that replace repetitive work: AI agents, WhatsApp and
Telegram bots, API integrations and workflow automation.

What I actually deliver:
- AI agents connected to your own data, with human approval steps where money or
  customer data is involved.
- Integrations between the tools you already use: CRMs, Airtable, Google Sheets,
  Supabase, WhatsApp Cloud API, Telegram.
- Production automation with retries, logging and alerts, not a demo that breaks
  the second week.
- n8n / Make / Zapier workflows when a low-code path is the right answer.

How I work:
1. We define scope and deliverables in writing before anything is built.
2. I show a working version early, then refine.
3. Every delivery includes documentation and a short walkthrough video.

Stack: Node.js, Cloudflare Workers, Supabase, REST APIs, n8n, WhatsApp Cloud API,
Telegram, Airtable, Gemini / OpenAI / Groq.

Based in Colombia, working with US and EU clients. English and Spanish.
```

## 5. Casos de portafolio (sin inventar clientes)

Estos tres se pueden mostrar porque existen en este repositorio:

1. **Motor de ventas con cola durable** — Worker cada 5 minutos, reclamación
   atómica de trabajos en Supabase, lease, reintentos y dead-letter. Ningún job se
   procesa dos veces.
2. **Conectores de marketplace con recibos** — integración con Upwork (MCP) y
   Freelancer: lectura de oportunidades, control de duplicados, topes de gasto y
   recibo del proveedor por cada acción.
3. **Atención al cliente por WhatsApp** — webhook verificado, consentimiento
   explícito, sin envíos a contactos sin permiso.

Cada caso debe presentarse como **lo que se construyó**, no como resultado
comercial. No hay clientes ni ingresos verificables todavía, y afirmar lo
contrario cierra la cuenta.

## 6. Tarifa

Con perfil sin reseñas, la tarifa alta espanta y la muy baja atrae proyectos que
consumen tiempo sin dejar margen.

- **Por hora:** USD 25–35 al inicio. Subir a 45–60 después de 3 reseñas.
- **Por proyecto:** mínimo USD 300. Por debajo de eso, la comisión de Freelancer
  (10% o USD 5 mínimo) y el tiempo de propuesta se comen la utilidad.

## 7. Cómo conseguir las primeras reseñas

Sin atajos: una reseña solo existe después de un contrato pagado dentro de la
plataforma. El camino corto es:

1. **Primeros 3 trabajos pequeños y rápidos** (USD 150–500): un bot, una
   integración, un scraper, una automatización de una sola tarea. Se entregan en
   días y producen una reseña cada uno.
2. **Entregar antes de tiempo** y adjuntar el video de 60 segundos. La reseña la
   dispara la percepción de orden, no el precio.
3. **Pedir feedback al cerrar**, sin condicionarlo: se puede pedir que dejen
   comentario; nunca pedir "5 estrellas" ni ofrecer algo a cambio. Eso viola las
   reglas y es motivo de suspensión.
4. **Responder en menos de 1 hora.** Los datos de 4,2 millones de propuestas
   muestran 31.4% de entrevista si respondes en menos de una hora contra 9.2% si
   respondes en 24–72 horas.

Después de 4 contratos con feedback aparece el Job Success Score en Upwork. Ahí
cambia el juego: las invitaciones de clientes contestan al 76%, contra 4.9% de una
postulación en frío.

## 8. Checklist antes de publicar

- [ ] Skills de la tabla cargadas en Freelancer y Upwork.
- [ ] Titular y resumen pegados, revisados en inglés.
- [ ] Foto de perfil profesional (no logo).
- [ ] 3 casos de portafolio publicados con captura o video.
- [ ] Tarifa mínima configurada en USD 300 por proyecto.
- [ ] Disponibilidad marcada, zona horaria declarada.
- [ ] Métodos de pago verificados en ambas plataformas.
- [ ] Perfil revisado por una persona antes de publicar.

## 9. Decisiones pendientes del titular

1. ¿Se cargan las skills de la sección 2 tal cual, o se quita alguna?
2. ¿Se declara "n8n" como skill propia o solo como herramienta mencionada en el
   resumen? Depende de si hay un flujo n8n que se pueda mostrar.
3. ¿Se publica el perfil antes o después de tener los casos de portafolio listos?
