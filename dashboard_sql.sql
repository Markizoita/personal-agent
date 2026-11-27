-- Start Up Ops dashboard: data layer only (no login, no web app yet).
-- VIEWING: one read per tab, shaped like the "Start Up Ops Dashboard" design:
--   get_dashboard_home()                 Home tab (timer, today's to-dos, proof, tomorrow)
--   get_dashboard_progress(period)       Progress tab (The Climb + metric cards; week|month|all)
--   get_dashboard_projects()             Projects tab
--   get_dashboard_history(days)          History tab: list of days
--   get_dashboard_day(date)              History tab: one day's detail
-- DOING (existing): start_startup_session, stop_startup_session, add_startup_todo,
--   complete_startup_todo, log_startup_proof, finalize_startup_day.
-- DOING (new): set_startup_todo_done, delete_startup_todo, set_startup_project, set_startup_off_day.
-- Needs game_sql.sql first. Safe to re-run. All dates are America/New_York.

-- ---------- helpers ----------

create or replace function startup_day_minutes(p_day date, p_project text default null)
returns numeric language sql stable as $$
  select coalesce(sum(extract(epoch from (coalesce(stop_at, now()) - start_at)) / 60.0), 0)
  from startup_sessions
  where (start_at at time zone 'America/New_York')::date = p_day
    and (p_project is null or project = p_project)
$$;

-- Same rules as the game (Win = proof, Showed up = 10+ min, Miss, Off), but for any day,
-- including ones before the game started (History shows those too).
create or replace function startup_day_result(p_day date)
returns text language plpgsql stable as $$
declare v_today date := startup_today();
declare v_weekend boolean := extract(isodow from p_day) > 5;
declare v_min numeric := startup_day_minutes(p_day);
begin
  if p_day > v_today then return null; end if;
  if exists(select 1 from startup_daily_results where log_date = p_day and result = 'Off') then return 'Off'; end if;
  if exists(select 1 from startup_proof where log_date = p_day) then return 'Win'; end if;
  if p_day = v_today then return case when v_weekend and v_min = 0 then 'Off' else 'Now' end; end if;
  if v_weekend and v_min = 0 then return 'Off'; end if;
  if v_min >= 10 then return 'Showed up'; end if;
  return 'Miss';
end;
$$;

-- The game uses the same rules, limited to days since the game started.
create or replace function game_day_result(p_day date)
returns text language plpgsql stable as $$
begin
  if p_day > startup_today() or p_day < game_start_date() then return null; end if;
  return startup_day_result(p_day);
end;
$$;

create or replace function startup_clock(p_ts timestamptz)
returns text language sql stable as $$
  select case when p_ts is null then null
    else ltrim(to_char(p_ts at time zone 'America/New_York', 'HH12:MI'), '0') ||
         lower(to_char(p_ts at time zone 'America/New_York', 'am')) end
$$;

-- ---------- viewing ----------

create or replace function get_dashboard_home()
returns jsonb language plpgsql stable as $$
declare v_today date := startup_today();
declare v_first_move bigint;
declare v_state jsonb := get_game_state();
begin
  select id into v_first_move from startup_todos where day = v_today and not done order by id limit 1;
  return jsonb_build_object(
    'date', v_today,
    'date_label', to_char(v_today, 'Dy Mon FMDD'),
    'session', get_startup_open_session(),
    'minutes_today', round(startup_day_minutes(v_today)),
    'started_at', (select startup_clock(min(start_at)) from startup_sessions where (start_at at time zone 'America/New_York')::date = v_today),
    'projects', coalesce((select jsonb_agg(name order by (status = 'Parked'), id) from startup_projects), '[]'::jsonb),
    'todo_groups', coalesce((
      select jsonb_agg(jsonb_build_object('project', project, 'items', items) order by first_id)
      from (select project, min(id) first_id,
                   jsonb_agg(jsonb_build_object('id', id, 'text', text, 'tag', tag, 'done', done, 'first_move', id = v_first_move) order by id) items
            from startup_todos where day = v_today group by project) g), '[]'::jsonb),
    'proof', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'project', project) order by id)
                       from startup_proof where log_date = v_today), '[]'::jsonb),
    'result', startup_day_result(v_today),
    'xp_today', v_state->'today'->'xp',
    'win_waiting', v_state->'today'->'win_waiting',
    'tomorrow', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'project', project, 'text', text) order by id)
                          from startup_todos where day = v_today + 1), '[]'::jsonb),
    'tomorrow_schedule', coalesce((
      select jsonb_agg(jsonb_build_object('title', title, 'start', start_time, 'end', end_time, 'place', place) order by start_time)
      from schedule_items where log_date = v_today + 1), '[]'::jsonb)
  );
end;
$$;

-- Metric cards for a period: 'week' (this Mon-today vs the same days last week),
-- 'month' (month to date vs the same days last month) or 'all' (since the first logged day).
create or replace function get_dashboard_progress(p_period text default 'week')
returns jsonb language plpgsql stable as $$
declare v_period text := lower(coalesce(nullif(nullif(trim(p_period), ''), 'null'), 'week'));
declare v_today date := startup_today();
declare v_from date;
declare v_prev_from date;
declare v_prev_to date;
declare v_first date;
declare v_label text;
begin
  select least(
           (select min((start_at at time zone 'America/New_York')::date) from startup_sessions),
           (select min(log_date) from startup_proof),
           (select min(log_date) from game_task_log where undone_at is null))
    into v_first;
  v_first := coalesce(v_first, v_today);

  if v_period = 'month' then
    v_from := date_trunc('month', v_today)::date;
    v_prev_from := (v_from - interval '1 month')::date;
    v_prev_to := least((v_prev_from + (v_today - v_from))::date, v_from - 1);
    v_label := to_char(v_today, 'Mon') || ' so far';
  elsif v_period = 'all' then
    v_period := 'all';
    v_from := v_first;
    v_label := 'since ' || to_char(v_first, 'Mon FMDD');
  else
    v_period := 'week';
    v_from := v_today - (extract(isodow from v_today)::int - 1);
    v_prev_from := v_from - 7;
    v_prev_to := v_today - 7;
    v_label := 'vs last week';
  end if;

  return jsonb_build_object(
    'period', v_period, 'label', v_label, 'from', v_from, 'to', v_today,
    'game', get_game_state(),
    'metrics', (
      select jsonb_agg(m order by ord) from (
        select 1 ord, jsonb_build_object('key', 'win_days', 'label', 'Win days', 'power', 'Work', 'unit', 'days',
          'value', (select count(distinct log_date) from startup_proof where log_date between v_from and v_today),
          'prev', case when v_prev_from is not null then (select count(distinct log_date) from startup_proof where log_date between v_prev_from and v_prev_to) end,
          'xp', (select coalesce(sum(xp), 0) from game_task_log where undone_at is null and task_key = 'win_day' and log_date between v_from and v_today),
          'last7', (select jsonb_agg((select count(*) > 0 from startup_proof where log_date = d::date)::int order by d)
                    from generate_series(v_today - 6, v_today, interval '1 day') d)) m
        union all
        select 2, jsonb_build_object('key', 'hours', 'label', 'Hours', 'power', 'Work', 'unit', 'hours',
          'value', round((select coalesce(sum(startup_day_minutes(d::date)), 0) from generate_series(v_from, v_today, interval '1 day') d) / 60.0, 1),
          'prev', case when v_prev_from is not null then round((select coalesce(sum(startup_day_minutes(d::date)), 0) from generate_series(v_prev_from, v_prev_to, interval '1 day') d) / 60.0, 1) end,
          'xp', (select coalesce(sum(xp), 0) from game_task_log where undone_at is null and task_key = 'hour_worked' and log_date between v_from and v_today),
          'last7', (select jsonb_agg(round(startup_day_minutes(d::date) / 60.0, 1) order by d) from generate_series(v_today - 6, v_today, interval '1 day') d))
        union all
        select 3 + k.n, jsonb_build_object('key', k.key, 'label', k.label, 'power', k.power, 'unit', k.unit,
          'value', (select coalesce(sum(quantity), 0) from game_task_log where undone_at is null and task_key = k.task and log_date between v_from and v_today),
          'prev', case when v_prev_from is not null then (select coalesce(sum(quantity), 0) from game_task_log where undone_at is null and task_key = k.task and log_date between v_prev_from and v_prev_to) end,
          'xp', (select coalesce(sum(xp), 0) from game_task_log where undone_at is null and power = k.power and log_date between v_from and v_today),
          'last7', (select jsonb_agg((select coalesce(sum(quantity), 0) from game_task_log where undone_at is null and task_key = k.task and log_date = d::date) order by d)
                    from generate_series(v_today - 6, v_today, interval '1 day') d))
        from (values (0, 'shipped', 'Shipped', 'Shipping', 'times', 'shipped'),
                     (1, 'pitched', 'Pitched', 'Selling', 'times', 'pitched'),
                     (2, 'earned', 'Earned', 'Earning', 'dollars', 'money')) k(n, key, label, power, unit, task)
      ) x)
  );
end;
$$;

create or replace function get_dashboard_projects()
returns jsonb language plpgsql stable as $$
declare v_today date := startup_today();
declare v_week_start date := v_today - (extract(isodow from v_today)::int - 1);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', p.name, 'status', p.status,
      'total_hours', round((select coalesce(sum(extract(epoch from (coalesce(stop_at, now()) - start_at))), 0) from startup_sessions where project = p.name) / 3600.0, 1),
      'week_hours', round((select coalesce(sum(startup_day_minutes(d::date, p.name)), 0) from generate_series(v_week_start, v_today, interval '1 day') d) / 60.0, 1),
      'last7_hours', (select jsonb_agg(round(startup_day_minutes(d::date, p.name) / 60.0, 1) order by d) from generate_series(v_today - 6, v_today, interval '1 day') d),
      'shipped', (select coalesce(sum(quantity), 0) from game_task_log where undone_at is null and task_key = 'shipped' and project = p.name),
      'open_items', (select count(*) from startup_todos where project = p.name and not done and day >= v_today),
      'done_items', (select count(*) from startup_todos where project = p.name and done),
      'last_worked', (select max((start_at at time zone 'America/New_York')::date) from startup_sessions where project = p.name)
    ) order by (p.status = 'Parked'), p.ord)
    from (
      select name, status, id ord from startup_projects
      union all
      select distinct x.project, 'Building', 1000000 from (
        select project from startup_sessions union select project from startup_todos
      ) x where x.project is not null and not exists (select 1 from startup_projects sp where sp.name = x.project)
    ) p), '[]'::jsonb);
end;
$$;

-- Days with any Start Up activity in the last p_days days (and every past weekday since the game started), newest first.
create or replace function get_dashboard_history(p_days text default '30')
returns jsonb language plpgsql stable as $$
declare v_today date := startup_today();
declare v_n int := coalesce(nullif(regexp_replace(coalesce(p_days, ''), '[^0-9]', '', 'g'), '')::int, 30);
begin
  return jsonb_build_object('days', coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', d, 'label', to_char(d, 'Dy Mon FMDD'), 'result', startup_day_result(d),
      'hours', round(startup_day_minutes(d) / 60.0, 1), 'xp', game_day_xp(d)) order by d desc)
    from (
      select g::date d from generate_series(v_today - (v_n - 1), v_today, interval '1 day') g
      where g::date = v_today
         or exists(select 1 from startup_sessions where (start_at at time zone 'America/New_York')::date = g::date)
         or exists(select 1 from startup_proof where log_date = g::date)
         or exists(select 1 from startup_todos where day = g::date)
         or exists(select 1 from startup_daily_results where log_date = g::date and result is not null)
         or exists(select 1 from game_task_log where log_date = g::date and undone_at is null)
         or (g::date >= game_start_date() and extract(isodow from g) <= 5)
    ) days), '[]'::jsonb));
end;
$$;

create or replace function get_dashboard_day(p_date text default null)
returns jsonb language plpgsql stable as $$
declare v_day date := coalesce(nullif(nullif(trim(coalesce(p_date, '')), ''), 'null')::date, startup_today());
begin
  return jsonb_build_object(
    'date', v_day, 'label', to_char(v_day, 'Dy Mon FMDD'),
    'result', startup_day_result(v_day),
    'off_reason', (select off_reason from startup_daily_results where log_date = v_day),
    'hours', round(startup_day_minutes(v_day) / 60.0, 1),
    'started_at', (select startup_clock(min(start_at)) from startup_sessions where (start_at at time zone 'America/New_York')::date = v_day),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', pr.project,
        'hours', round(startup_day_minutes(v_day, pr.project) / 60.0, 1),
        'todos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'done', done) order by id)
                           from startup_todos where day = v_day and project = pr.project), '[]'::jsonb)
      ) order by pr.project)
      from (select project from startup_sessions where (start_at at time zone 'America/New_York')::date = v_day
            union select project from startup_todos where day = v_day) pr), '[]'::jsonb),
    'proof', coalesce((select jsonb_agg(text order by id) from startup_proof where log_date = v_day), '[]'::jsonb),
    'xp', game_day_xp(v_day),
    'game_tasks', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'task', task_name, 'power', power, 'quantity', quantity, 'xp', xp, 'project', project) order by id)
                            from game_task_log where log_date = v_day and undone_at is null), '[]'::jsonb)
  );
end;
$$;

-- ---------- doing ----------

-- Starting while another session runs now stops it properly first (so its hours earn XP).
create or replace function start_startup_session(p_project text, p_kind text default 'build')
returns jsonb language plpgsql as $$
declare v_project text := nullif(nullif(trim(coalesce(p_project, '')), ''), 'null');
declare v_kind text := coalesce(nullif(nullif(trim(coalesce(p_kind, '')), ''), 'null'), 'build');
declare v_id bigint;
declare v_stopped jsonb;
begin
  if v_project is null then
    select project into v_project from startup_sessions order by start_at desc limit 1;
    v_project := coalesce(v_project, 'Personal agent');
  end if;
  if exists(select 1 from startup_sessions where stop_at is null) then
    v_stopped := stop_startup_session();
  end if;
  insert into startup_sessions (project, kind) values (v_project, v_kind) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'project', v_project, 'start_at', now(), 'stopped_previous', v_stopped);
end;
$$;

-- Tick / untick a to-do by id (the Home checkbox).
create or replace function set_startup_todo_done(p_id text, p_done text default 'true')
returns jsonb language plpgsql as $$
declare v_id bigint := nullif(regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g'), '')::bigint;
declare v_done boolean := coalesce(nullif(nullif(lower(trim(coalesce(p_done, ''))), ''), 'null'), 'true') in ('true', 't', '1', 'yes', 'done');
declare v_row startup_todos;
begin
  update startup_todos set done = v_done, done_at = case when v_done then now() end
   where id = v_id returning * into v_row;
  if v_row.id is null then return jsonb_build_object('ok', false, 'reason', 'not found'); end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'text', v_row.text, 'done', v_row.done);
end;
$$;

create or replace function delete_startup_todo(p_id text)
returns jsonb language plpgsql as $$
declare v_id bigint := nullif(regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g'), '')::bigint;
declare v_text text;
begin
  delete from startup_todos where id = v_id returning text into v_text;
  if v_text is null then return jsonb_build_object('ok', false, 'reason', 'not found'); end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'text', v_text);
end;
$$;

-- Add a project or change its status (Building / Testing / Parked / ...).
create or replace function set_startup_project(p_name text, p_status text default 'Building')
returns jsonb language plpgsql as $$
declare v_name text := nullif(nullif(trim(coalesce(p_name, '')), ''), 'null');
declare v_status text := coalesce(nullif(nullif(trim(coalesce(p_status, '')), ''), 'null'), 'Building');
begin
  if v_name is null then return jsonb_build_object('ok', false, 'reason', 'name required'); end if;
  insert into startup_projects (name, status) values (v_name, v_status)
  on conflict (name) do update set status = excluded.status;
  return jsonb_build_object('ok', true, 'name', v_name, 'status', v_status);
end;
$$;

-- Mark today Off (job / event day): not a Miss, doesn't break the streak.
create or replace function set_startup_off_day(p_reason text default 'event')
returns jsonb language plpgsql as $$
begin
  return finalize_startup_day(coalesce(nullif(nullif(trim(coalesce(p_reason, '')), ''), 'null'), 'event'));
end;
$$;

grant execute on all functions in schema public to service_role;
