-- Epic 10.1 — Row Level Security.
--
-- The API/worker connect to Postgres DIRECTLY (postgres.js) as the table owner, which
-- BYPASSES RLS — those services do ownership checks in code. RLS here protects the paths
-- that DO go through the Supabase anon key: the web app's Realtime subscription to `crawls`,
-- and any future PostgREST exposure. RLS is enabled (not FORCED) so the owner keeps working.
--
-- Apply with:  pnpm --filter db policies      (runs packages/db/src/apply-policies.ts)
-- Safe to run repeatedly.

alter table users               enable row level security;
alter table sites               enable row level security;
alter table site_secrets        enable row level security;
alter table crawls              enable row level security;
alter table pages               enable row level security;
alter table issues              enable row level security;
alter table recommendations     enable row level security;
alter table keyword_data        enable row level security;
alter table traffic_estimates   enable row level security;
alter table audit_log           enable row level security;
alter table job_runs            enable row level security;

-- users: a person sees only their own row
drop policy if exists users_self on users;
create policy users_self on users
  for select using (id = auth.uid());

-- sites: owner only
drop policy if exists sites_owner on sites;
create policy sites_owner on sites
  for select using (user_id = auth.uid());

-- site_secrets: never exposed to the anon role at all
drop policy if exists site_secrets_none on site_secrets;
create policy site_secrets_none on site_secrets
  for select using (false);

-- crawls: via the owning site (this is what Realtime needs)
drop policy if exists crawls_owner on crawls;
create policy crawls_owner on crawls
  for select using (
    exists (select 1 from sites s where s.id = crawls.site_id and s.user_id = auth.uid())
  );

drop policy if exists pages_owner on pages;
create policy pages_owner on pages
  for select using (
    exists (
      select 1 from crawls c join sites s on s.id = c.site_id
      where c.id = pages.crawl_id and s.user_id = auth.uid()
    )
  );

drop policy if exists issues_owner on issues;
create policy issues_owner on issues
  for select using (
    exists (
      select 1 from pages p join crawls c on c.id = p.crawl_id join sites s on s.id = c.site_id
      where p.id = issues.page_id and s.user_id = auth.uid()
    )
  );

drop policy if exists recommendations_owner on recommendations;
create policy recommendations_owner on recommendations
  for select using (
    exists (
      select 1 from issues i join pages p on p.id = i.page_id
      join crawls c on c.id = p.crawl_id join sites s on s.id = c.site_id
      where i.id = recommendations.issue_id and s.user_id = auth.uid()
    )
  );

drop policy if exists keyword_data_owner on keyword_data;
create policy keyword_data_owner on keyword_data
  for select using (
    exists (select 1 from sites s where s.id = keyword_data.site_id and s.user_id = auth.uid())
  );

drop policy if exists traffic_estimates_owner on traffic_estimates;
create policy traffic_estimates_owner on traffic_estimates
  for select using (
    exists (select 1 from sites s where s.id = traffic_estimates.site_id and s.user_id = auth.uid())
  );

drop policy if exists audit_log_owner on audit_log;
create policy audit_log_owner on audit_log
  for select using (user_id = auth.uid());

drop policy if exists job_runs_none on job_runs;
create policy job_runs_none on job_runs
  for select using (false);

-- Realtime: the dashboard subscribes to crawl-row updates for live progress.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table crawls;
  end if;
exception when duplicate_object then
  null;
end $$;
