create or replace function set_schedule(p_log_date date, p_items jsonb)
returns jsonb
language plpgsql
as $$
declare
  v_item jsonb;
  v_start time;
  v_end time;
  v_title text;
begin
  delete from schedule_items
  where log_date = p_log_date
    and title not in (select value->>'title' from jsonb_array_elements(p_items) as value);

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_title := v_item->>'title';
    v_start := (v_item->>'start_time')::time;
    v_end := nullif(v_item->>'end_time', '')::time;

    if exists (select 1 from schedule_items where log_date = p_log_date and title = v_title) then
      update schedule_items
      set start_time = v_start,
          end_time = v_end,
          place = nullif(v_item->>'place', ''),
          check_at = coalesce(v_end, v_start + interval '1 hour'),
          pinged = false
      where log_date = p_log_date and title = v_title;
    else
      insert into schedule_items (log_date, title, start_time, end_time, place, check_at)
      values (
        p_log_date, v_title, v_start, v_end,
        nullif(v_item->>'place', ''),
        coalesce(v_end, v_start + interval '1 hour')
      );
    end if;
  end loop;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'title', title, 'start_time', start_time, 'end_time', end_time,
      'place', place, 'status', status, 'what_happened', what_happened
    ) order by start_time), '[]'::jsonb)
    from schedule_items where log_date = p_log_date
  );
end;
$$;

grant execute on function set_schedule to service_role;
