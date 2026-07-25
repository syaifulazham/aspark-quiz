-- Quizzly initial schema
-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- Enums
create type org_role        as enum ('owner','admin','author','viewer');
create type quiz_status     as enum ('draft','published','archived');
create type question_kind   as enum ('mcq_single','true_false','numeric');
create type content_kind    as enum ('text','image','text_image');
create type session_state   as enum ('issued','active','submitted','expired','abandoned','voided');
create type session_mode    as enum ('solo','live');
create type gender_kind     as enum ('male','female','other','undisclosed');
create type room_state      as enum ('lobby','question_open','question_locked','reveal','leaderboard','finished');

-- Organizations
create table organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         citext not null unique,
  logo_key     text,
  settings     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Profiles (admins)
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  email        citext not null,
  full_name    text,
  role         org_role not null default 'author',
  created_at   timestamptz not null default now()
);
create index on profiles (org_id);

-- Quizzes
create table quizzes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  slug          citext not null,
  title         text not null,
  description   text,
  cover_key     text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  unique (org_id, slug)
);

-- Quiz versions
create table quiz_versions (
  id                  uuid primary key default gen_random_uuid(),
  quiz_id             uuid not null references quizzes(id) on delete cascade,
  org_id              uuid not null references organizations(id) on delete cascade,
  version             int  not null,
  status              quiz_status not null default 'draft',
  time_limit_seconds  int,
  per_question_seconds int,
  shuffle_questions   boolean not null default false,
  shuffle_options     boolean not null default true,
  allow_backtrack     boolean not null default true,
  show_feedback       text not null default 'after_submit'
                      check (show_feedback in ('never','immediate','after_submit')),
  passing_score       numeric(6,2),
  max_attempts        int not null default 1,
  negative_marking    numeric(4,2) not null default 0,
  speed_bonus_enabled boolean not null default false,
  speed_bonus_max     int not null default 0,
  published_at        timestamptz,
  published_by        uuid references profiles(id),
  created_at          timestamptz not null default now(),
  unique (quiz_id, version)
);
create index on quiz_versions (org_id, status);

-- Questions
create table questions (
  id               uuid primary key default gen_random_uuid(),
  quiz_version_id  uuid not null references quiz_versions(id) on delete cascade,
  org_id           uuid not null references organizations(id) on delete cascade,
  position         int  not null,
  kind             question_kind not null,
  content_kind     content_kind  not null default 'text',
  stem             jsonb not null,
  stem_html        text,
  stem_plain       text,
  media_key        text,
  media_alt        text,
  media_width      int,
  media_height     int,
  media_blurhash   text,
  explanation      jsonb,
  explanation_html text,
  points           numeric(6,2) not null default 1,
  time_seconds     int,
  numeric_answer   numeric,
  numeric_tolerance numeric not null default 0,
  numeric_unit     text,
  created_at       timestamptz not null default now(),
  unique (quiz_version_id, position),
  constraint media_needs_alt check (media_key is null or media_alt is not null),
  constraint numeric_needs_answer check (kind <> 'numeric' or numeric_answer is not null)
);
create index on questions (quiz_version_id, position);

-- Question options
create table question_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references questions(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  position     int  not null,
  label        jsonb not null,
  label_html   text,
  media_key    text,
  media_alt    text,
  is_correct   boolean not null default false,
  unique (question_id, position)
);
create index on question_options (question_id);

-- Participants
create table participants (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  personal_id   citext not null,
  full_name     text not null,
  nationality   char(2),
  date_of_birth date,
  age           int,
  gender        gender_kind,
  school        text,
  agency        text,
  email         citext,
  phone         text,
  external_ref  text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, personal_id)
);
create index on participants (org_id, school);
create index on participants (org_id, agency);

-- API keys
create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  key_hash      bytea not null unique,
  key_prefix    text  not null,
  environment   text  not null default 'live' check (environment in ('live','test')),
  scopes        text[] not null default '{participants:write,tokens:write,results:read}',
  quiz_ids      uuid[],
  ip_allowlist  inet[],
  rate_limit_rpm int not null default 120,
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);
create index on api_keys (org_id) where revoked_at is null;

-- API key usage
create table api_key_usage (
  id           bigserial primary key,
  api_key_id   uuid not null references api_keys(id) on delete cascade,
  org_id       uuid not null references organizations(id) on delete cascade,
  endpoint     text not null,
  method       text not null,
  status_code  int  not null,
  duration_ms  int,
  ip_address   inet,
  request_id   text,
  created_at   timestamptz not null default now()
);
create index on api_key_usage (api_key_id, created_at desc);

-- Live rooms
create table live_rooms (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  quiz_version_id  uuid not null references quiz_versions(id) on delete restrict,
  code             char(6) not null unique,
  host_id          uuid references profiles(id),
  state            room_state not null default 'lobby',
  current_index    int not null default 0,
  settings         jsonb not null default '{}'::jsonb,
  started_at       timestamptz,
  ended_at         timestamptz,
  created_at       timestamptz not null default now()
);

-- Live rounds
create table live_rounds (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references live_rooms(id) on delete cascade,
  question_id   uuid not null references questions(id) on delete restrict,
  round_index   int not null,
  opened_at     timestamptz,
  closes_at     timestamptz,
  locked_at     timestamptz,
  revealed_at   timestamptz,
  unique (room_id, round_index)
);

-- Session tokens
create table session_tokens (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  participant_id   uuid not null references participants(id) on delete cascade,
  quiz_version_id  uuid not null references quiz_versions(id) on delete restrict,
  api_key_id       uuid references api_keys(id) on delete set null,
  token_hash       text not null unique,
  token_prefix     text  not null,
  mode             session_mode not null default 'solo',
  live_room_id     uuid references live_rooms(id) on delete set null,
  expires_at       timestamptz not null,
  not_before       timestamptz,
  redeemed_at      timestamptz,
  redeemed_ip      inet,
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index on session_tokens (org_id, participant_id);
create index on session_tokens (expires_at) where redeemed_at is null;

-- Quiz sessions
create table quiz_sessions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  token_id         uuid not null unique references session_tokens(id) on delete restrict,
  participant_id   uuid not null references participants(id) on delete cascade,
  quiz_version_id  uuid not null references quiz_versions(id) on delete restrict,
  mode             session_mode not null default 'solo',
  live_room_id     uuid references live_rooms(id) on delete set null,
  state            session_state not null default 'issued',
  question_order   uuid[] not null default '{}',
  started_at       timestamptz,
  deadline_at      timestamptz,
  submitted_at     timestamptz,
  last_seen_at     timestamptz,
  duration_ms      int,
  raw_score        numeric(8,2),
  max_score        numeric(8,2),
  percentage       numeric(5,2),
  passed           boolean,
  correct_count    int,
  incorrect_count  int,
  unanswered_count int,
  user_agent       text,
  ip_address       inet,
  integrity_flags  jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now()
);
create index on quiz_sessions (org_id, quiz_version_id, state);
create index on quiz_sessions (participant_id, submitted_at desc);

-- Session answers
create table session_answers (
  id                uuid primary key default gen_random_uuid(),
  session_id        uuid not null references quiz_sessions(id) on delete cascade,
  org_id            uuid not null references organizations(id) on delete cascade,
  question_id       uuid not null references questions(id) on delete restrict,
  selected_option_id uuid references question_options(id),
  numeric_response   numeric,
  bool_response      boolean,
  is_correct        boolean,
  points_awarded    numeric(6,2) not null default 0,
  speed_bonus       numeric(6,2) not null default 0,
  displayed_at      timestamptz,
  answered_at       timestamptz,
  time_taken_ms     int,
  revision_count    int not null default 0,
  unique (session_id, question_id)
);
create index on session_answers (session_id);

-- Idempotency keys
create table idempotency_keys (
  key            text primary key,
  api_key_id     uuid not null references api_keys(id) on delete cascade,
  endpoint       text not null,
  request_hash   bytea not null,
  response_body  jsonb,
  status_code    int,
  created_at     timestamptz not null default now()
);

-- Audit log
create table audit_log (
  id           bigserial primary key,
  org_id       uuid not null references organizations(id) on delete cascade,
  actor_type   text not null check (actor_type in ('user','api_key','system')),
  actor_id     uuid,
  action       text not null,
  entity_type  text not null,
  entity_id    uuid,
  diff         jsonb,
  ip_address   inet,
  created_at   timestamptz not null default now()
);
create index on audit_log (org_id, created_at desc);

-- Row Level Security
alter table organizations   enable row level security;
alter table profiles        enable row level security;
alter table quizzes         enable row level security;
alter table quiz_versions   enable row level security;
alter table questions       enable row level security;
alter table question_options enable row level security;
alter table participants    enable row level security;
alter table session_tokens  enable row level security;
alter table quiz_sessions   enable row level security;
alter table session_answers enable row level security;
alter table api_keys        enable row level security;
alter table audit_log       enable row level security;

-- Helper functions
create or replace function auth_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid();
$$;

create or replace function auth_role() returns org_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- RLS Policies
create policy org_read on organizations for select
  using (id = auth_org_id());

create policy profiles_read on profiles for select
  using (org_id = auth_org_id());

create policy quizzes_read on quizzes for select
  using (org_id = auth_org_id());

create policy quizzes_write on quizzes for all
  using (org_id = auth_org_id() and auth_role() in ('owner','admin','author'))
  with check (org_id = auth_org_id() and auth_role() in ('owner','admin','author'));

create policy versions_read on quiz_versions for select
  using (org_id = auth_org_id());

create policy versions_write on quiz_versions for insert
  with check (org_id = auth_org_id() and auth_role() in ('owner','admin','author'));

create policy versions_update on quiz_versions for update
  using (org_id = auth_org_id() and status = 'draft');

create policy questions_read on questions for select
  using (org_id = auth_org_id());

create policy questions_write on questions for all
  using (org_id = auth_org_id() and auth_role() in ('owner','admin','author'))
  with check (org_id = auth_org_id() and auth_role() in ('owner','admin','author'));

create policy options_read on question_options for select
  using (org_id = auth_org_id());

create policy options_write on question_options for all
  using (org_id = auth_org_id() and auth_role() in ('owner','admin','author'))
  with check (org_id = auth_org_id() and auth_role() in ('owner','admin','author'));

create policy participants_read on participants for select
  using (org_id = auth_org_id());

create policy participants_write on participants for all
  using (org_id = auth_org_id() and auth_role() in ('owner','admin','author'))
  with check (org_id = auth_org_id() and auth_role() in ('owner','admin','author'));

create policy sessions_read on quiz_sessions for select
  using (org_id = auth_org_id());

create policy answers_read on session_answers for select
  using (org_id = auth_org_id());

create policy keys_admin_only on api_keys for all
  using (org_id = auth_org_id() and auth_role() in ('owner','admin'));

create policy audit_read on audit_log for select
  using (org_id = auth_org_id());

-- Column-level protection for participant-facing queries
revoke select (is_correct) on question_options from anon;
revoke select (numeric_answer, numeric_tolerance) on questions from anon;
