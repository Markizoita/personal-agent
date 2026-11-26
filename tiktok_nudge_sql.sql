alter table tiktok_sessions add column if not exists last_notified_minutes int not null default 0;

create or replace function get_tiktok_open_session_elapsed()
returns jsonb
language plpgsql
as $$
declare
  v_session record;
  v_elapsed numeric;
  v_next_threshold int;
begin
  select * into v_session from tiktok_sessions where close_at is null order by open_at desc limit 1;
  if v_session is null then
    return jsonb_build_object('due', false);
  end if;

  v_elapsed := extract(epoch from (now() - v_session.open_at)) / 60.0;
  v_next_threshold := v_session.last_notified_minutes + 5;

  if v_elapsed >= v_next_threshold then
    update tiktok_sessions set last_notified_minutes = v_next_threshold where id = v_session.id;
    return jsonb_build_object('due', true, 'minutes', v_next_threshold);
  end if;

  return jsonb_build_object('due', false);
end;
$$;

grant execute on function get_tiktok_open_session_elapsed to service_role;
