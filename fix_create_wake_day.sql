drop function if exists create_wake_day(date, text, text);

create or replace function create_wake_day(p_log_date date, p_passage text, p_source text)
returns jsonb
language plpgsql
as $$
begin
  insert into wake_proof (log_date, passage_text, passage_source, sent_at, result)
  values (p_log_date, p_passage, p_source, now(), null)
  on conflict (log_date) do nothing;
  return jsonb_build_object('ok', true, 'log_date', p_log_date);
end;
$$;

grant execute on function create_wake_day to service_role;
