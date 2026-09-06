update "user"
set "role" = 'admin', "updatedAt" = current_timestamp
where lower("email") = lower('drainix@gmail.com');
