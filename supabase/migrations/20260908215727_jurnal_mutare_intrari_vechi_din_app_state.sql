alter table activity_log disable trigger activity_log_semnatura;

insert into activity_log (at, user_id, user_name, user_role, action, detail)
select (e ->> 'ts')::timestamptz,
       s.user_id,
       coalesce(nullif(e ->> 'userName', ''), '?'),
       coalesce(nullif(e ->> 'userRole', ''), '?'),
       left(e ->> 'action', 200),
       left(e ->> 'detail', 1000)
from app_state a,
     jsonb_array_elements(a.value) e
     left join staff s on s.name = e ->> 'userName'
where a.key = 'pms:log:v3'
  and e ->> 'action' is not null
order by (e ->> 'ts')::timestamptz asc;

alter table activity_log enable trigger activity_log_semnatura;