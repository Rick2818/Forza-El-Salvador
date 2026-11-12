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

El motor mantiene cerradas las escrituras de plataformas:
`LEO_PLATFORM_WRITE_ENABLED=false` y `FREELANCER_API_ENABLED=false`.
Los jobs deben producir observaciones, scoring y borradores para revisión humana.
