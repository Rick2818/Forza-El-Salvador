-- Rollback for 202611080001_crm_revenue_engine.sql. Not executed.
drop function if exists public.claim_crm_jobs(text, integer, integer);
drop table if exists public.crm_approvals, public.crm_events, public.crm_agent_runs,
  public.crm_orders, public.crm_followups, public.crm_proposals, public.crm_interactions,
  public.crm_campaigns, public.crm_opportunities, public.crm_leads,
  public.crm_job_attempts, public.crm_jobs cascade;
