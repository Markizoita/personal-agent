-- Run this AFTER the wake_proof table exists.

create or replace function record_wake_reply(p_log_date date, p_attempt int, p_text text, p_passed boolean)
returns void language sql as $$
  update wake_proof set
    reply_1_text = case when p_attempt=1 then p_text else reply_1_text end,
    reply_1_at = case when p_attempt=1 then now() else reply_1_at end,
    reply_1_passed = case when p_attempt=1 then p_passed else reply_1_passed end,
    reply_2_text = case when p_attempt=2 then p_text else reply_2_text end,
    reply_2_at = case when p_attempt=2 then now() else reply_2_at end,
    reply_2_passed = case when p_attempt=2 then p_passed else reply_2_passed end,
    updated_at = now()
  where log_date = p_log_date;
$$;

create or replace function finalize_wake_day(p_log_date date, p_result text)
returns jsonb
language plpgsql
as $$
declare
  v_prev_current int;
  v_prev_best int;
  v_new_current int;
  v_new_best int;
begin
  select streak_current, streak_best into v_prev_current, v_prev_best
  from wake_proof where log_date < p_log_date order by log_date desc limit 1;

  v_prev_current := coalesce(v_prev_current, 0);
  v_prev_best := coalesce(v_prev_best, 0);

  if p_result = 'on_time' then
    v_new_current := v_prev_current + 1;
  elsif p_result = 'skipped' then
    v_new_current := v_prev_current;
  else
    v_new_current := 0;
  end if;

  v_new_best := greatest(v_prev_best, v_new_current);

  update wake_proof
  set result = p_result, streak_current = v_new_current, streak_best = v_new_best, updated_at = now()
  where log_date = p_log_date;

  return jsonb_build_object('result', p_result, 'streak_current', v_new_current, 'streak_best', v_new_best);
end;
$$;

create or replace function grade_wake_reply(p_log_date date, p_attempt int, p_reply_text text, p_passed boolean)
returns jsonb
language plpgsql
as $$
declare
  v_cutoff timestamptz;
  v_result text;
  v_fin jsonb;
begin
  perform record_wake_reply(p_log_date, p_attempt, p_reply_text, p_passed);

  if not p_passed then
    return jsonb_build_object('passed', false, 'attempt', p_attempt);
  end if;

  v_cutoff := (p_log_date::timestamp at time zone 'America/New_York') + interval '7 hours 30 minutes';
  v_result := case when now() <= v_cutoff then 'on_time' else 'late' end;
  v_fin := finalize_wake_day(p_log_date, v_result);
  return v_fin || jsonb_build_object('passed', true);
end;
$$;

create or replace function create_wake_day(p_log_date date, p_passage text, p_source text)
returns void language sql as $$
  insert into wake_proof (log_date, passage_text, passage_source, sent_at, result)
  values (p_log_date, p_passage, p_source, now(), null)
  on conflict (log_date) do nothing;
$$;

create or replace function reset_wake_day_for_test(p_log_date date)
returns void language sql as $$
  delete from wake_proof where log_date = p_log_date;
$$;

create or replace function mark_wake_skip(p_log_date date)
returns jsonb
language plpgsql
as $$
declare
  v_exists boolean;
  v_recent_skips int;
  v_fin jsonb;
begin
  select exists(select 1 from wake_proof where log_date = p_log_date) into v_exists;
  if v_exists then
    return jsonb_build_object('ok', false, 'reason', 'today already has an entry');
  end if;

  select count(*) into v_recent_skips
  from wake_proof
  where result = 'skipped' and log_date >= p_log_date - interval '6 days';

  if v_recent_skips >= 1 then
    return jsonb_build_object('ok', false, 'reason', 'already used this week''s skip');
  end if;

  insert into wake_proof (log_date, result) values (p_log_date, 'skipped');
  v_fin := finalize_wake_day(p_log_date, 'skipped');
  return v_fin || jsonb_build_object('ok', true);
end;
$$;

create or replace function get_wake_routing()
returns jsonb
language sql
as $$
  select coalesce(
    (select jsonb_build_object(
       'pending', true,
       'attempt', case when reply_1_text is null then 1 else 2 end
     )
     from wake_proof
     where log_date = (now() at time zone 'America/New_York')::date
       and result is null
       and (reply_1_text is null or (reply_1_passed = false and reply_2_text is null))
    ),
    jsonb_build_object('pending', false)
  );
$$;

create or replace function get_wake_send_status()
returns jsonb language sql as $$
  select jsonb_build_object(
    'already_exists', exists(
      select 1 from wake_proof where log_date = (now() at time zone 'America/New_York')::date
    )
  );
$$;

create or replace function get_wake_nudge_status()
returns jsonb language sql as $$
  select jsonb_build_object(
    'need_nudge', exists(
      select 1 from wake_proof
      where log_date = (now() at time zone 'America/New_York')::date
        and result is null
        and reply_1_text is null
    )
  );
$$;

create or replace function get_wake_cutoff_status()
returns jsonb language sql as $$
  select jsonb_build_object(
    'needs_miss', exists(
      select 1 from wake_proof
      where log_date = (now() at time zone 'America/New_York')::date
        and result is null
    )
  );
$$;

grant execute on function record_wake_reply, finalize_wake_day, grade_wake_reply, create_wake_day,
  reset_wake_day_for_test, mark_wake_skip, get_wake_routing, get_wake_send_status,
  get_wake_nudge_status, get_wake_cutoff_status to service_role;
