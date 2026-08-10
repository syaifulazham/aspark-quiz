-- Per-quiz time limit inside a competition session (null = no limit)
alter table session_quiz_sets
  add column time_limit_seconds int;

alter table session_quiz_sets
  add constraint sqs_time_limit_positive
  check (time_limit_seconds is null or time_limit_seconds > 0);
