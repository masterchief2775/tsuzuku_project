-- Ephemeral typing indicators for private threads. One row per direction,
-- refreshed on keystroke (throttled client-side), read as "peer typed within
-- the last 5s". Stale rows are simply ignored — no cleanup job needed.

create table if not exists "message_typing" (
  "typer_id" text not null references "user" ("id") on delete cascade,
  "with_id" text not null references "user" ("id") on delete cascade,
  "updated_at" timestamptz not null default current_timestamp,
  primary key ("typer_id", "with_id")
);
