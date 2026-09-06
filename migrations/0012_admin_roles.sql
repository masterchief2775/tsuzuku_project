alter table "user"
  add column if not exists "role" text not null default 'user';

alter table "user"
  drop constraint if exists "user_role_check";

alter table "user"
  add constraint "user_role_check"
  check ("role" in ('user', 'admin'));

create index if not exists "user_role_idx" on "user" ("role");
