create or replace function get_due_schedule_pings()
returns jsonb
language plpgsql
as $$
declare
  v_today date;
  v_now time;
  v_result jsonb;
  v_quiet boolean;
begin
  v_today := (now() at time zone 'America/New_York')::date;
  v_now := (now() at time zone 'America/New_York')::time;
  v_quiet := (v_now >= time '22:30' or v_now < time '07:00');

  if v_quiet then
    return jsonb_build_object('items', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'start_time', start_time, 'end_time', end_time, 'place', place
  )), '[]'::jsonb)
  into v_result
  from schedule_items
  where log_date = v_today
    and status = 'pending'
    and pinged = false
    and check_at <= v_now
    and not (
      abs(extract(epoch from (check_at - time '08:00'))) <= 900 or
      abs(extract(epoch from (check_at - time '14:00'))) <= 900 or
      abs(extract(epoch from (check_at - time '17:00'))) <= 900 or
      abs(extract(epoch from (check_at - time '22:00'))) <= 900
    );

  update schedule_items set pinged = true
  where log_date = v_today
    and status = 'pending'
    and pinged = false
    and check_at <= v_now
    and not (
      abs(extract(epoch from (check_at - time '08:00'))) <= 900 or
      abs(extract(epoch from (check_at - time '14:00'))) <= 900 or
      abs(extract(epoch from (check_at - time '17:00'))) <= 900 or
      abs(extract(epoch from (check_at - time '22:00'))) <= 900
    );

  return jsonb_build_object('items', v_result);
end;
$$;

grant execute on function get_due_schedule_pings to service_role;
