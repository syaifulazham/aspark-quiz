-- Bind session tokens to a competition session (participant + session + quiz set)
alter table session_tokens
  add column competition_session_id uuid references competition_sessions(id) on delete set null;

create index on session_tokens (competition_session_id) where competition_session_id is not null;
