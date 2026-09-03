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

-- --- Strategy module (Epics 13-19) — owner via site ---
alter table business_profiles enable row level security;
alter table competitors       enable row level security;
alter table competitor_pages  enable row level security;
alter table keyword_clusters  enable row level security;
alter table rank_snapshots    enable row level security;
alter table serp_results      enable row level security;
alter table keyword_playbooks enable row level security;
alter table roadmap_items     enable row level security;
alter table content_drafts    enable row level security;
alter table page_blueprints   enable row level security;
alter table interventions          enable row level security;
alter table impact_calibration     enable row level security;
alter table page_traffic_history   enable row level security;

drop policy if exists business_profiles_owner on business_profiles;
create policy business_profiles_owner on business_profiles for select using (
  exists (select 1 from sites s where s.id = business_profiles.site_id and s.user_id = auth.uid())
);

drop policy if exists competitors_owner on competitors;
create policy competitors_owner on competitors for select using (
  exists (select 1 from sites s where s.id = competitors.site_id and s.user_id = auth.uid())
);

drop policy if exists competitor_pages_owner on competitor_pages;
create policy competitor_pages_owner on competitor_pages for select using (
  exists (
    select 1 from competitors c join sites s on s.id = c.site_id
    where c.id = competitor_pages.competitor_id and s.user_id = auth.uid()
  )
);

drop policy if exists keyword_clusters_owner on keyword_clusters;
create policy keyword_clusters_owner on keyword_clusters for select using (
  exists (select 1 from sites s where s.id = keyword_clusters.site_id and s.user_id = auth.uid())
);

drop policy if exists rank_snapshots_owner on rank_snapshots;
create policy rank_snapshots_owner on rank_snapshots for select using (
  exists (select 1 from sites s where s.id = rank_snapshots.site_id and s.user_id = auth.uid())
);

drop policy if exists serp_results_owner on serp_results;
create policy serp_results_owner on serp_results for select using (
  exists (select 1 from sites s where s.id = serp_results.site_id and s.user_id = auth.uid())
);

drop policy if exists keyword_playbooks_owner on keyword_playbooks;
create policy keyword_playbooks_owner on keyword_playbooks for select using (
  exists (
    select 1 from keyword_data k join sites s on s.id = k.site_id
    where k.id = keyword_playbooks.keyword_id and s.user_id = auth.uid()
  )
);

drop policy if exists roadmap_items_owner on roadmap_items;
create policy roadmap_items_owner on roadmap_items for select using (
  exists (select 1 from sites s where s.id = roadmap_items.site_id and s.user_id = auth.uid())
);

drop policy if exists content_drafts_owner on content_drafts;
create policy content_drafts_owner on content_drafts for select using (
  exists (select 1 from sites s where s.id = content_drafts.site_id and s.user_id = auth.uid())
);

drop policy if exists page_blueprints_owner on page_blueprints;
create policy page_blueprints_owner on page_blueprints for select using (
  exists (select 1 from sites s where s.id = page_blueprints.site_id and s.user_id = auth.uid())
);

drop policy if exists interventions_owner on interventions;
create policy interventions_owner on interventions for select using (
  exists (select 1 from sites s where s.id = interventions.site_id and s.user_id = auth.uid())
);

drop policy if exists impact_calibration_owner on impact_calibration;
create policy impact_calibration_owner on impact_calibration for select using (
  exists (select 1 from sites s where s.id = impact_calibration.site_id and s.user_id = auth.uid())
);

drop policy if exists page_traffic_history_owner on page_traffic_history;
create policy page_traffic_history_owner on page_traffic_history for select using (
  exists (select 1 from sites s where s.id = page_traffic_history.site_id and s.user_id = auth.uid())
);

-- --- AI-agent phase ---
alter table llm_usage       enable row level security;
alter table seo_agent_notes enable row level security;

drop policy if exists llm_usage_none on llm_usage;
create policy llm_usage_none on llm_usage for select using (false);

drop policy if exists seo_agent_notes_owner on seo_agent_notes;
create policy seo_agent_notes_owner on seo_agent_notes for select using (
  exists (select 1 from sites s where s.id = seo_agent_notes.site_id and s.user_id = auth.uid())
);

-- Realtime: the dashboard subscribes to crawl-row updates for live progress.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table crawls;
  end if;
exception when duplicate_object then
  null;
end $$;
