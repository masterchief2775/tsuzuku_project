-- Watch Party lite (V3 §3.1, server-relayed): ephemeral rooms where friends
-- follow the same episode together. Chat + membership are DELETED on close —
-- nothing persists after the session (see closeParty in src/lib/party.ts).

create table if not exists "party_room" (
  "id" text not null primary key,
  "host_id" text not null references "user" ("id") on delete cascade,
  "title" text not null,
  "anilist_id" integer,
  "image" text,
  "episode" integer not null default 1,
  "status" text not null default 'open'
    check ("status" in ('open', 'closed')),
  "invite_token" text not null unique,
  "created_at" timestamptz not null default current_timestamp,
  "closed_at" timestamptz
);
create index if not exists "party_room_host_idx" on "party_room" ("host_id", "status");
create index if not exists "party_room_token_idx" on "party_room" ("invite_token");

create table if not exists "party_member" (
  "room_id" text not null references "party_room" ("id") on delete cascade,
  "user_id" text not null references "user" ("id") on delete cascade,
  "status" text not null default 'ready'
    check ("status" in ('ready', 'paused', 'done')),
  "progress" integer not null default 0,
  "joined_at" timestamptz not null default current_timestamp,
  primary key ("room_id", "user_id")
);
create index if not exists "party_member_user_idx" on "party_member" ("user_id");

create table if not exists "party_message" (
  "id" text not null primary key,
  "room_id" text not null references "party_room" ("id") on delete cascade,
  "sender_id" text not null references "user" ("id") on delete cascade,
  "body" text not null,
  "created_at" timestamptz not null default current_timestamp
);
create index if not exists "party_message_room_idx" on "party_message" ("room_id", "created_at" desc);
