-- Vote integrity: make (item_id, list_id) coherence a DATABASE invariant.
--
-- `shared_list_vote` carried two independent FKs (item_id -> shared_list_item,
-- list_id -> shared_list) and a primary key of (item_id, user_id), so nothing
-- stopped a row from naming an item that belongs to a DIFFERENT list. Vote
-- counters are aggregated by `item_id` alone, so such a row inflated another
-- list's counters. The API now scopes every statement to the caller's list, but
-- the constraint below is the durable guarantee.

-- 1. Drop rows whose pair is incoherent (injected while the API was unscoped).
delete from "shared_list_vote" v
where not exists (
  select 1 from "shared_list_item" i
  where i."id" = v."item_id" and i."list_id" = v."list_id"
);

-- 2. Composite unique key on the parent, required to reference it as a pair.
create unique index if not exists "shared_list_item_id_list_uidx"
  on "shared_list_item" ("id", "list_id");

-- 3. Enforce the pair itself. Idempotent: drop first, then re-add.
alter table "shared_list_vote" drop constraint if exists "shared_list_vote_item_list_fkey";
alter table "shared_list_vote"
  add constraint "shared_list_vote_item_list_fkey"
  foreign key ("item_id", "list_id")
  references "shared_list_item" ("id", "list_id")
  on delete cascade;