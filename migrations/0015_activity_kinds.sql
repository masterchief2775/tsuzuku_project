-- Expand friend_activity kinds for notifications center (shared lists, etc.)
alter table "friend_activity" drop constraint if exists "friend_activity_kind_check";
alter table "friend_activity"
  add constraint "friend_activity_kind_check"
  check ("kind" in (
    'completed',
    'rated',
    'friend_request',
    'friend_accept',
    'list_add',
    'list_join',
    'list_vote'
  ));
