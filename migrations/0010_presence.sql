create table if not exists "user_presence" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "last_seen" timestamptz not null default current_timestamp
);

create index if not exists "user_presence_last_seen_idx" on "user_presence" ("last_seen");
