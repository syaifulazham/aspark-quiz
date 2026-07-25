-- Registration forms: public self-registration endpoints
create table registration_forms (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  title         text not null,
  slug          citext not null,
  description   text,
  is_active     boolean not null default true,
  require_passcode boolean not null default false,
  passcode      text, -- nullable, only used when require_passcode = true
  -- Which fields to collect (JSON array of field names)
  fields        jsonb not null default '["personal_id","full_name","email","school"]'::jsonb,
  -- Optional: auto-assign participants to a quiz
  quiz_id       uuid references quizzes(id) on delete set null,
  -- Limits
  max_registrations int, -- null = unlimited
  closes_at     timestamptz, -- null = never closes
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, slug)
);

create index on registration_forms (org_id, is_active);

-- RLS
alter table registration_forms enable row level security;

create policy regforms_read on registration_forms for select
  using (org_id = auth_org_id());

create policy regforms_write on registration_forms for all
  using (org_id = auth_org_id() and auth_role() in ('owner','admin','author'))
  with check (org_id = auth_org_id() and auth_role() in ('owner','admin','author'));
