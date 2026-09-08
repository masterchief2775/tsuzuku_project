-- Collaborative shared lists: status, votes, invite links, viewer role

alter table "shared_list_item"
  add column if not exists "status" text not null default 'planned';

alter table "shared_list_item"
  add column if not exists "notes" text;

alter table "shared_list_item"
  add column if not exists "priority" integer not null default 0;

-- Relax / extend role constraint to allow viewer
alter table "shared_list_member" drop constraint if exists "shared_list_member_role_check";
alter table "shared_list_member"
  add constraint "shared_list_member_role_check"
  check ("role" in ('owner', 'editor', 'viewer'));

alter table "shared_list"
  add column if not exists "invite_token" text;

alter table "shared_list"
  add column if not exists "invite_enabled" boolean not null default false;

create unique index if not exists "shared_list_invite_token_uidx"
  on "shared_list" ("invite_token")
  where "invite_token" is not null;

create table if not exists "shared_list_vote" (
  "item_id" text not null references "shared_list_item" ("id") on delete cascade,
  "list_id" text not null references "shared_list" ("id") on delete cascade,
  "user_id" text not null references "user" ("id") on delete cascade,
  "created_at" timestamptz not null default current_timestamp,
  primary key ("item_id", "user_id")
);
create index if not exists "shared_list_vote_list_idx" on "shared_list_vote" ("list_id");
create index if not exists "shared_list_vote_item_idx" on "shared_list_vote" ("item_id");
