-- Profile pack V3-lite: visibility levels, favorites, external links, section toggles.
-- visibility: public | friends | private (is_public kept in sync for search: public only)

alter table "user_profile"
  add column if not exists "visibility" text not null default 'public'
    check ("visibility" in ('public', 'friends', 'private'));

alter table "user_profile"
  add column if not exists "show_stats" boolean not null default true;

alter table "user_profile"
  add column if not exists "show_favorites" boolean not null default true;

-- Top favorites: JSON array of { anilistId, title, image } (max 5 enforced in app)
alter table "user_profile"
  add column if not exists "favorites" jsonb not null default '[]'::jsonb;

alter table "user_profile"
  add column if not exists "anilist_url" text;

alter table "user_profile"
  add column if not exists "mal_url" text;

-- Backfill visibility from existing is_public
update "user_profile"
set "visibility" = case when "is_public" then 'public' else 'private' end
where "visibility" is null or ("visibility" = 'public' and "is_public" = false);

create index if not exists "user_profile_visibility_idx"
  on "user_profile" ("visibility");
