alter table startup_daily_results add column if not exists wrapup_sent boolean not null default false;

create or replace function finalize_startup_day(p_off_reason text default null)
returns jsonb language plpgsql as $$
declare v_today date := startup_today();
declare v_level int;
declare v_minutes int;
declare v_goal int;
declare v_has_proof boolean;
declare v_result text;
declare v_xp int;
declare v_prev_xp int;
declare v_win_count int;
declare v_dow int := extract(isodow from now() at time zone 'America/New_York');
declare v_off_count int;
begin
  select level into v_level from startup_state where id = 1;
  v_minutes := startup_minutes_today();
  v_goal := startup_goal_minutes(v_level);
  select exists(select 1 from startup_proof where log_date = v_today) into v_has_proof;

  if p_off_reason is not null and trim(p_off_reason) <> '' then
    v_result := 'Off';
  elsif v_minutes >= v_goal and v_has_proof then
    v_result := 'Win';
  elsif v_minutes >= 10 then
    v_result := 'Showed up';
  else
    v_result := 'Miss';
  end if;

  v_xp := (case when v_result = 'Win' then 20 else 0 end) + round(v_minutes / 60.0 * 5);

  select xp into v_prev_xp from startup_daily_results where log_date = v_today;
  v_prev_xp := coalesce(v_prev_xp, 0);

  insert into startup_daily_results (log_date, minutes, result, off_reason, level, xp, wrapped)
  values (v_today, v_minutes, v_result, p_off_reason, v_level, v_xp, true)
  on conflict (log_date) do update set
    minutes = v_minutes, result = v_result, off_reason = p_off_reason,
    level = v_level, xp = v_xp, wrapped = true;

  update startup_state set total_xp = total_xp + (v_xp - v_prev_xp) where id = 1;

  select count(*) into v_win_count from startup_daily_results
  where level = v_level and result = 'Win' and log_date > v_today - 7 and log_date <= v_today;
  if v_win_count >= 5 and v_level < 5 then
    update startup_state set level = v_level + 1 where id = 1;
  end if;

  if v_dow = 7 then
    select count(*) filter (where result = 'Win'), count(*) filter (where result = 'Off')
      into v_win_count, v_off_count
      from startup_daily_results
      where log_date > v_today - 7 and log_date <= v_today;
    if v_win_count <= 2 and v_off_count < 3 and v_level > 1 then
      update startup_state set level = v_level - 1 where id = 1;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'result', v_result, 'minutes', v_minutes, 'goal', v_goal,
    'xp', v_xp, 'level', v_level, 'has_proof', v_has_proof);
end;
$$;

create or replace function check_startup_wrapup_due(p_end_time text default '17:00')
returns jsonb language plpgsql as $$
declare v_today date := startup_today();
declare v_dow int := extract(isodow from now() at time zone 'America/New_York');
declare v_already boolean;
begin
  if v_dow > 5 then return jsonb_build_object('due', false); end if;
  if (now() at time zone 'America/New_York')::time < (p_end_time::time - interval '15 minutes') then
    return jsonb_build_object('due', false);
  end if;
  select wrapup_sent into v_already from startup_daily_results where log_date = v_today;
  if coalesce(v_already, false) then return jsonb_build_object('due', false); end if;
  insert into startup_daily_results (log_date, wrapup_sent) values (v_today, true)
    on conflict (log_date) do update set wrapup_sent = true;
  return jsonb_build_object('due', true);
end;
$$;
