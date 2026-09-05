create table if not exists "user_block" (
  "id" text not null primary key,
  "blocker_id" text not null references "user" ("id") on delete cascade,
  "blocked_id" text not null references "user" ("id") on delete cascade,
  "created_at" timestamptz not null default current_timestamp,
  constraint "user_block_no_self" check ("blocker_id" <> "blocked_id"),
  constraint "user_block_unique" unique ("blocker_id", "blocked_id")
);
create index if not exists "user_block_blocker_idx" on "user_block" ("blocker_id");
create index if not exists "user_block_blocked_idx" on "user_block" ("blocked_id");
