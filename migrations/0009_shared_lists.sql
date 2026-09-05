create table if not exists "shared_list" (
  "id" text not null primary key,
  "name" text not null,
  "description" text,
  "owner_id" text not null references "user" ("id") on delete cascade,
  "created_at" timestamptz not null default current_timestamp,
  "updated_at" timestamptz not null default current_timestamp
);
create index if not exists "shared_list_owner_idx" on "shared_list" ("owner_id");

create table if not exists "shared_list_member" (
  "list_id" text not null references "shared_list" ("id") on delete cascade,
  "user_id" text not null references "user" ("id") on delete cascade,
  "role" text not null default 'editor'
    check ("role" in ('owner', 'editor')),
  "joined_at" timestamptz not null default current_timestamp,
  primary key ("list_id", "user_id")
);
create index if not exists "shared_list_member_user_idx" on "shared_list_member" ("user_id");

create table if not exists "shared_list_item" (
  "id" text not null primary key,
  "list_id" text not null references "shared_list" ("id") on delete cascade,
  "anilist_id" integer not null,
  "title" text not null,
  "image" text,
  "added_by" text not null references "user" ("id") on delete cascade,
  "created_at" timestamptz not null default current_timestamp,
  constraint "shared_list_item_unique" unique ("list_id", "anilist_id")
);
create index if not exists "shared_list_item_list_idx" on "shared_list_item" ("list_id");
