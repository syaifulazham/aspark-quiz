-- Public scoreboards: shareable, optionally passcode-protected leaderboards for a competition session
create table public_scoreboards (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations(id) on delete cascade,
  competition_session_id uuid not null references competition_sessions(id) on delete cascade,
  title                  text not null,
  slug                   citext not null unique,        -- public URL: /scoreboard/{slug}
  description            text,
  is_active              boolean not null default true,
  passcode_hash          text,                          -- null = no passcode; "scrypt$<salt>$<hash>"
  top_n                  int not null default 10 check (top_n between 1 and 100),
  countries              text[] not null default '{}',  -- empty = all countries
  quiz_version_ids       uuid[] not null default '{}',  -- empty = every quiz in the session
  auto_refresh           boolean not null default true,
  opens_at               timestamptz,                   -- null = visible immediately
  closes_at              timestamptz,                   -- null = never closes
  created_by             uuid references profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint public_scoreboards_window check (opens_at is null or closes_at is null or opens_at < closes_at)
);

create index on public_scoreboards (org_id);
create index on public_scoreboards (competition_session_id);

alter table public_scoreboards enable row level security;

create policy scoreboards_read on public_scoreboards for select
  using (org_id = auth_org_id());

create policy scoreboards_write on public_scoreboards for all
  using (org_id = auth_org_id() and auth_role() in ('owner','admin'))
  with check (org_id = auth_org_id() and auth_role() in ('owner','admin'));
