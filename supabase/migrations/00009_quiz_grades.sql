-- Target school grades for a quiz (empty = all grades)
alter table quizzes
  add column grades int[] not null default '{}';

alter table quizzes
  add constraint quizzes_grades_valid
  check (grades <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::int[]);
