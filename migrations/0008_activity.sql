-- Friend activity feed (V3 phase 2).
-- Events are written per recipient (friends only) so queries stay simple and
-- visibility is enforced at write time.

create table if not exists "friend_activity" (
  "id" text not null primary key,
  "recipient_id" text not null references "user" ("id") on delete cascade,
  "actor_id" text not null references "user" ("id") on delete cascade,
  "kind" text not null
    check ("kind" in ('completed', 'rated', 'friend_request', 'friend_accept')),
  "title" text,
  "anilist_id" integer,
  "image" text,
  "rating" double precision,
  "created_at" timestamptz not null default current_timestamp,
  "read_at" timestamptz
);

create index if not exists "friend_activity_recipient_created_idx"
  on "friend_activity" ("recipient_id", "created_at" desc);

create index if not exists "friend_activity_recipient_unread_idx"
  on "friend_activity" ("recipient_id")
  where "read_at" is null;
