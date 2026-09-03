-- Public / private user profiles on top of Better Auth's "user" table.
-- username is the searchable handle; avatar can be a URL or a small data-URL.

create table if not exists "user_profile" (
  "user_id" text not null primary key references "user" ("id") on delete cascade,
  "username" text not null,
  "display_name" text,
  "bio" text not null default '',
  "avatar_url" text,
  "is_public" boolean not null default true,
  "created_at" timestamptz not null default current_timestamp,
  "updated_at" timestamptz not null default current_timestamp,
  constraint "user_profile_username_format" check (
    char_length("username") >= 3
    and char_length("username") <= 24
    and "username" ~ '^[a-z0-9][a-z0-9_]*$'
  )
);

create unique index if not exists "user_profile_username_lower_idx"
  on "user_profile" (lower("username"));

create index if not exists "user_profile_public_idx"
  on "user_profile" ("is_public") where "is_public" = true;
