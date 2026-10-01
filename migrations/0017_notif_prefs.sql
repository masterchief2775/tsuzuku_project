-- Per-kind notification preferences (V3 §3.2): the fan-out skips kinds the
-- recipient turned off (see activity-fanout.server.ts). All on by default.

create table if not exists "notification_prefs" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "completed" boolean not null default true,
  "rated" boolean not null default true,
  "friend_request" boolean not null default true,
  "friend_accept" boolean not null default true,
  "list_add" boolean not null default true,
  "list_join" boolean not null default true,
  "list_vote" boolean not null default true
);
