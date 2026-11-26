create or replace function set_schedule_clarification(p_candidates jsonb, p_raw_reply text)
returns jsonb
language plpgsql
as $$
begin
  delete from pending_schedule_clarification where true;
  insert into pending_schedule_clarification (candidates, raw_reply) values (p_candidates, p_raw_reply);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function check_schedule_item(p_id bigint, p_status text, p_what_happened text default null)
returns jsonb
language plpgsql
as $$
begin
  update schedule_items
  set status = p_status,
      what_happened = nullif(nullif(trim(p_what_happened), ''), 'null'),
      checked_at = now()
  where id = p_id;

  delete from pending_schedule_clarification where true;

  return (select jsonb_build_object('id', id, 'title', title, 'status', status, 'what_happened', what_happened)
          from schedule_items where id = p_id);
end;
$$;

grant execute on function set_schedule_clarification, check_schedule_item to service_role;
