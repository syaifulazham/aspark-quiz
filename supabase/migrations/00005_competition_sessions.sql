-- Competition sessions: organized events/competitions
create type competition_type as enum ('public', 'live_tournament', 'online_competition');

create table competition_sessions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  title         text not null,
  slug          citext not null,
  description   text,
  session_type  competition_type not null default 'public',
  is_active     boolean not null default true,
  opens_at      timestamptz,       -- null = immediately open
  closes_at     timestamptz,       -- null = never closes
  settings      jsonb not null default '{}'::jsonb,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, slug)
);

create index on competition_sessions (org_id, is_active);

-- Join table: a session can have multiple quiz sets
create table session_quiz_sets (
  id                    uuid primary key default gen_random_uuid(),
  competition_session_id uuid not null references competition_sessions(id) on delete cascade,
  quiz_version_id       uuid not null references quiz_versions(id) on delete restrict,
  position              int not null default 0,
  label                 text,  -- optional label like "Round 1", "Paper A"
  unique (competition_session_id, quiz_version_id)
);

create index on session_quiz_sets (competition_session_id);

-- Link registration forms to a competition session instead of just a quiz
alter table registration_forms
  add column competition_session_id uuid references competition_sessions(id) on delete set null;

-- Link participant registrations to a competition session
alter table participants
  add column competition_session_id uuid references competition_sessions(id) on delete set null;

create index on participants (competition_session_id) where competition_session_id is not null;

-- RLS
alter table competition_sessions enable row level security;
alter table session_quiz_sets enable row level security;

create policy comp_sessions_read on competition_sessions for select
  using (org_id = auth_org_id());

create policy comp_sessions_write on competition_sessions for all
  using (org_id = auth_org_id() and auth_role() in ('owner','admin','author'))
  with check (org_id = auth_org_id() and auth_role() in ('owner','admin','author'));

-- session_quiz_sets inherits access via the parent competition_session
create policy sqs_read on session_quiz_sets for select
  using (exists (
    select 1 from competition_sessions cs
    where cs.id = competition_session_id and cs.org_id = auth_org_id()
  ));

create policy sqs_write on session_quiz_sets for all
  using (exists (
    select 1 from competition_sessions cs
    where cs.id = competition_session_id
      and cs.org_id = auth_org_id()
      and auth_role() in ('owner','admin','author')
  ))
  with check (exists (
    select 1 from competition_sessions cs
    where cs.id = competition_session_id
      and cs.org_id = auth_org_id()
      and auth_role() in ('owner','admin','author')
  ));
