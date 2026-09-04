-- Friend requests & friendships between Tsuzuku accounts.
-- status: pending | accepted | rejected
-- requester_id sent the request; addressee_id received it.
-- When accepted, both users are friends (query either direction).

create table if not exists "friendship" (
  "id" text not null primary key,
  "requester_id" text not null references "user" ("id") on delete cascade,
  "addressee_id" text not null references "user" ("id") on delete cascade,
  "status" text not null default 'pending'
    check ("status" in ('pending', 'accepted', 'rejected')),
  "created_at" timestamptz not null default current_timestamp,
  "updated_at" timestamptz not null default current_timestamp,
  constraint "friendship_no_self" check ("requester_id" <> "addressee_id")
);

-- One active row per ordered pair (requester → addressee)
create unique index if not exists "friendship_pair_idx"
  on "friendship" ("requester_id", "addressee_id");

create index if not exists "friendship_requester_idx"
  on "friendship" ("requester_id", "status");

create index if not exists "friendship_addressee_idx"
  on "friendship" ("addressee_id", "status");
