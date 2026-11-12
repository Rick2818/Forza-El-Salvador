-- Prepared migration only. It has not been applied to any Supabase project.
-- Apply after verifying the target project, backups, RLS and operator identity.

create extension if not exists pgcrypto;

create table if not exists public.crm_leads (
  id uuid primary key default gen_random_uuid(), company text not null,
  contact text, country text, industry text, source text not null,
  source_id text, source_url text, need text, estimated_budget numeric,
  commercial_score integer check (commercial_score between 0 and 100),
  status text not null default 'DISCOVERED', owner text, next_action text,
  next_followup_at timestamptz, last_interaction_at timestamptz,
  consent_record jsonb, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.crm_leads(id),
  platform text not null, state text not null default 'DISCOVERED', payment_state text not null default 'PENDING',
  score integer check (score between 0 and 100), next_action text, evidence jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(), external_id text unique, name text not null,
  platform text not null, objective text, segment jsonb, budget_limit numeric default 0,
  status text not null default 'DRAFT', metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.crm_interactions (
  id uuid primary key default gen_random_uuid(), lead_id uuid references public.crm_leads(id),
  opportunity_id uuid references public.crm_opportunities(id), channel text not null,
  direction text not null, content_redacted text, provider_receipt text,
  consent_record jsonb, created_at timestamptz not null default now()
);
create table if not exists public.crm_proposals (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.crm_opportunities(id),
  status text not null default 'DRAFT', scope jsonb, quote jsonb, approval_id uuid,
  provider_receipt text, created_at timestamptz not null default now()
);
create table if not exists public.crm_followups (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.crm_opportunities(id),
  scheduled_at timestamptz not null, status text not null default 'PENDING', attempt integer not null default 0,
  lease_until timestamptz, idempotency_key text unique, stop_reason text, created_at timestamptz not null default now()
);
create table if not exists public.crm_orders (
  id uuid primary key default gen_random_uuid(), opportunity_id uuid not null references public.crm_opportunities(id),
  status text not null default 'PENDING', payment_state text not null default 'PENDING', provider_receipt text,
  amount numeric, created_at timestamptz not null default now()
);
create table if not exists public.crm_agent_runs (
  id uuid primary key default gen_random_uuid(), worker text not null, status text not null,
  started_at timestamptz not null default now(), finished_at timestamptz, receipt text, error_code text, metrics jsonb
);
create table if not exists public.crm_events (
  id uuid primary key default gen_random_uuid(), event_type text not null, entity_type text,
  entity_id uuid, idempotency_key text not null unique, payload jsonb, created_at timestamptz not null default now()
);
create table if not exists public.crm_approvals (
  id uuid primary key default gen_random_uuid(), scope text not null, approved_by text not null,
  status text not null default 'PENDING', expires_at timestamptz, evidence jsonb, created_at timestamptz not null default now()
);

-- Durable work queue. Jobs are claimable with a lease so a crashed worker can
-- be recovered without running the same external-safe operation twice.
create table if not exists public.crm_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'boltech',
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','SUCCEEDED','RETRY','DEAD_LETTER','CANCELLED')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  worker text,
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.crm_jobs(id) on delete cascade,
  worker text not null,
  status text not null,
  error_code text,
  receipt text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists crm_jobs_claim_idx
  on public.crm_jobs(status, available_at, lease_until);
create index if not exists crm_jobs_tenant_idx
  on public.crm_jobs(tenant_id, created_at desc);

-- Atomic claim: SKIP LOCKED prevents two cron invocations from taking the
-- same job. Expired leases become claimable again.
create or replace function public.claim_crm_jobs(p_worker text, p_limit integer default 10, p_lease_seconds integer default 300)
returns setof public.crm_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select id from public.crm_jobs
    where (status in ('QUEUED','RETRY') and available_at <= now())
       or (status = 'RUNNING' and lease_until < now())
    order by available_at, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.crm_jobs j
     set status = 'RUNNING',
         attempts = j.attempts + 1,
         lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 1800))),
         worker = left(coalesce(p_worker, 'unknown'), 120),
         updated_at = now()
    from candidates c
   where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.claim_crm_jobs(text, integer, integer) from public;
grant execute on function public.claim_crm_jobs(text, integer, integer) to service_role;

create index if not exists crm_opportunities_state_idx on public.crm_opportunities(state, score desc);
create index if not exists crm_followups_due_idx on public.crm_followups(status, scheduled_at);
create index if not exists crm_events_entity_idx on public.crm_events(entity_type, entity_id);

alter table public.crm_leads enable row level security;
alter table public.crm_opportunities enable row level security;
alter table public.crm_campaigns enable row level security;
alter table public.crm_interactions enable row level security;
alter table public.crm_proposals enable row level security;
alter table public.crm_followups enable row level security;
alter table public.crm_orders enable row level security;
alter table public.crm_agent_runs enable row level security;
alter table public.crm_events enable row level security;
alter table public.crm_approvals enable row level security;
alter table public.crm_jobs enable row level security;
alter table public.crm_job_attempts enable row level security;

-- No anon/authenticated policies are created intentionally. A future dashboard
-- role must receive explicit tenant-scoped policies after identity is chosen.
