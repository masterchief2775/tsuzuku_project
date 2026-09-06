create table if not exists "private_message" (
  "id" text not null primary key,
  "sender_id" text not null references "user" ("id") on delete cascade,
  "receiver_id" text not null references "user" ("id") on delete cascade,
  "body" text not null,
  "created_at" timestamptz not null default current_timestamp,
  "read_at" timestamptz,
  constraint "private_message_not_self" check ("sender_id" <> "receiver_id")
);

create index if not exists "private_message_receiver_idx" on "private_message" ("receiver_id", "created_at" desc);
create index if not exists "private_message_sender_idx" on "private_message" ("sender_id", "created_at" desc);
