# Leo Revenue Engine 24/7

La base de producción queda preparada para ejecución recuperable, pero no se
declara activa hasta aplicar la migración y verificar un recibo real.

## Componentes

- `crm_jobs`: cola durable con idempotencia, intentos y dead-letter.
- `claim_crm_jobs(...)`: reclamación atómica con `FOR UPDATE SKIP LOCKED` y lease.
- `/api/revenue-engine`: endpoint protegido para Cloudflare Cron/Worker.
- `workers/revenue-cron.js`: Worker programado cada 5 minutos.
- Supabase REST con `SUPABASE_SERVICE_ROLE_KEY`, nunca expuesta al navegador.

## Variables secretas de Cloudflare

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `REVENUE_ENGINE_CRON_SECRET`.
Opcionales: `REVENUE_ENGINE_WORKER_NAME`, `REVENUE_ENGINE_BATCH_SIZE`.

Aplicar la migración desde el proyecto Supabase correcto y después invocar el
endpoint con `Authorization: Bearer <REVENUE_ENGINE_CRON_SECRET>`. La respuesta
`CLAIMED_FOR_SUPERVISED_PROCESSING` solo confirma la reclamación de jobs; no
confirma postulaciones, mensajes ni pagos.

El Worker se despliega con `wrangler.revenue-cron.toml`. Su secreto debe
configurarse también en el Worker (los secretos de Pages no se comparten
automáticamente entre servicios).

## Límites operativos

Estado verificado el 13 de noviembre de 2026:

- `LEO_PLATFORM_WRITE_ENABLED=true` y `FREELANCER_API_ENABLED=true` en Cloudflare Pages.
- La lectura de plataformas sigue limitada por `LEO_PLATFORM_DAILY_READ_LIMIT`.
- El motor observa, puntúa y prepara borradores. **No** envía propuestas por sí solo.

### Proveedores

| Proveedor | Lectura | Envío | Bloqueo actual |
|---|---|---|---|
| Freelancer | ✅ `/api/platform` acción `freelancer_projects` | ⏳ `/api/freelancer-bid` (1 crédito gratis) | permiso de Bid sin verificar |
| Upwork | ✅ `/api/platform` acción `upwork_jobs` | ❌ | 18 Connects por propuesta, saldo insuficiente |

En Freelancer el conector entrega `projectId`, `budget` (mínimo, máximo, moneda y
equivalente en USD) y `bidCount`. Los importes se convierten con la tasa que
devuelve el proveedor; no se inventan rangos.

## Envío de propuestas en Freelancer

`POST /api/freelancer-bid` con `Authorization: Bearer <LEO_PLATFORM_TOKEN>`.

Controles aplicados antes de enviar:

1. Método `POST` y token válido.
2. `LEO_PLATFORM_WRITE_ENABLED=true` y `FREELANCER_API_ENABLED=true`.
3. `projectId` numérico, importe mayor que cero y descripción de 40+ caracteres.
4. Consulta previa de ofertas existentes del usuario en ese proyecto (anti-duplicado).
5. Tope de 8 propuestas por ejecución de control; el crédito consumido es 1.

La respuesta solo se considera éxito si el proveedor devuelve `status: success`;
entonces se registra `receipt` con `bidId`, `projectId`, importe, período y
`receivedAt`. Sin recibo, el envío se reporta como fallido y no se reintenta solo.

La aprobación humana sigue siendo obligatoria: el endpoint no se expone como
herramienta del bucle autónomo.
