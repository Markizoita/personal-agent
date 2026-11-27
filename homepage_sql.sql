-- Home page build: project to-do lists, submit-the-day with a Claude breakdown, Claude Code session summaries.
-- Safe to re-run. Wrapped in one transaction.
begin;

alter table startup_todos alter column day drop not null;  -- null = lives on its project only
alter table startup_proof add column if not exists todo_id bigint;
alter table startup_daily_results add column if not exists breakdown text;
alter table startup_daily_results add column if not exists submitted_at timestamptz;

create table if not exists claude_sessions (
  session_id text not null,
  day date not null,
  project text not null,
  minutes int not null default 0,
  summary text not null default '',
  updated_at timestamptz not null default now(),
  primary key (session_id, day)
);
alter table claude_sessions enable row level security;
revoke all on claude_sessions from anon, authenticated;
grant all on claude_sessions to service_role;

create or replace function startup_parse_day(p_day text) returns date language sql stable as $$
  select case lower(coalesce(nullif(nullif(trim(p_day), ''), 'null'), 'today'))
    when 'today' then startup_today()
    when 'tomorrow' then startup_today() + 1
    when 'later' then null
    when 'none' then null
    else trim(p_day)::date end
$$;

create or replace function add_startup_todo(p_project text, p_text text, p_day text default 'today', p_tag text default 'new')
returns jsonb language plpgsql as $$
declare v_project text := coalesce(nullif(nullif(trim(coalesce(p_project, '')), ''), 'null'), 'Personal agent');
declare v_text text := nullif(nullif(trim(coalesce(p_text, '')), ''), 'null');
declare v_tag text := coalesce(nullif(nullif(trim(coalesce(p_tag, '')), ''), 'null'), 'new');
declare v_id bigint;
begin
  if v_text is null then return jsonb_build_object('ok', false, 'reason', 'text required'); end if;
  insert into startup_projects (name) values (v_project) on conflict (name) do nothing;
  insert into startup_todos (project, text, day, tag) values (v_project, v_text, startup_parse_day(p_day), v_tag)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function schedule_startup_todo(p_id text, p_day text) returns jsonb language plpgsql as $$
declare v_id bigint := nullif(regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g'), '')::bigint;
begin
  update startup_todos set day = startup_parse_day(p_day) where id = v_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not found'); end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Proof can be dated (submitting a day that ran past midnight) and tied to the to-do it finished.
drop function if exists log_startup_proof(text, text);
create or replace function log_startup_proof(p_text text, p_project text default null, p_date date default null, p_todo_id bigint default null)
returns jsonb language plpgsql as $$
declare v_day date := coalesce(p_date, startup_today());
declare v_text text := nullif(nullif(trim(coalesce(p_text, '')), ''), 'null');
declare v_project text := nullif(nullif(trim(coalesce(p_project, '')), ''), 'null');
declare v_win_xp numeric;
begin
  if v_text is null then return jsonb_build_object('ok', false, 'reason', 'proof text required'); end if;
  insert into startup_proof (log_date, project, text, todo_id) values (v_day, v_project, v_text, p_todo_id);
  if not exists(select 1 from game_task_log where undone_at is null and task_key = 'win_day' and log_date = v_day) then
    insert into game_task_log (log_date, task_key, task_name, power, quantity, xp, source, note, project)
    select v_day, key, name, power, 1, xp, 'proof', left(v_text, 200), v_project from game_tasks where key = 'win_day'
    returning xp into v_win_xp;
  end if;
  return jsonb_build_object('ok', true, 'win_xp', v_win_xp);
end;
$$;

create or replace function complete_startup_todo_with_proof(p_id text, p_done text default 'true', p_proof text default null)
returns jsonb language plpgsql as $$
declare v_res jsonb := set_startup_todo_done(p_id, p_done);
declare v_row startup_todos;
declare v_proof text := nullif(nullif(trim(coalesce(p_proof, '')), ''), 'null');
begin
  if not (v_res->>'ok')::boolean or not (v_res->>'done')::boolean then return v_res; end if;
  -- finishing an item from a project list counts it on today's record
  update startup_todos set day = startup_today()
   where id = (v_res->>'id')::bigint and (day is null or day <> startup_today());
  select * into v_row from startup_todos where id = (v_res->>'id')::bigint;
  if v_proof is not null then
    perform log_startup_proof(v_row.text || ' — proof: ' || v_proof, v_row.project, null, v_row.id);
  end if;
  return v_res;
end;
$$;

-- XP for hours belongs to the day the session started, matching how hours are counted.
create or replace function stop_startup_session() returns jsonb language plpgsql as $$
declare v_session record;
declare v_minutes int;
declare v_game jsonb;
begin
  select * into v_session from startup_sessions where stop_at is null order by start_at desc limit 1;
  if v_session is null then
    return jsonb_build_object('ok', false, 'reason', 'no open session');
  end if;
  update startup_sessions set stop_at = now() where id = v_session.id;
  v_minutes := round(extract(epoch from (now() - v_session.start_at)) / 60.0);
  if v_minutes >= 1 then
    v_game := log_game_task('hour_worked', round(v_minutes / 60.0, 4)::text, null, 'timer', v_session.project);
    update game_task_log set log_date = (v_session.start_at at time zone 'America/New_York')::date
     where id = (v_game->>'id')::bigint;
  end if;
  return jsonb_build_object('ok', true, 'project', v_session.project, 'minutes', v_minutes, 'game', v_game);
end;
$$;

drop function if exists finalize_startup_day(text);
create or replace function finalize_startup_day(p_off_reason text default null, p_date date default null)
returns jsonb language plpgsql as $$
declare v_day date := coalesce(p_date, startup_today());
declare v_off text := nullif(nullif(trim(coalesce(p_off_reason, '')), ''), 'null');
declare v_minutes int := round(startup_day_minutes(v_day));
declare v_has_proof boolean;
declare v_result text;
declare v_xp numeric;
declare v_total numeric := game_total_xp();
begin
  select exists(select 1 from startup_proof where log_date = v_day) into v_has_proof;
  v_result := case
    when v_off is not null then 'Off'
    when v_has_proof then 'Win'
    when v_minutes >= 10 then 'Showed up'
    else 'Miss' end;
  v_xp := game_day_xp(v_day);
  insert into startup_daily_results (log_date, minutes, result, off_reason, level, xp, wrapped)
  values (v_day, v_minutes, v_result, v_off, game_level(v_total), round(v_xp), true)
  on conflict (log_date) do update set
    minutes = v_minutes, result = v_result, off_reason = v_off,
    level = game_level(v_total), xp = round(v_xp), wrapped = true;
  return jsonb_build_object('ok', true, 'result', v_result, 'minutes', v_minutes, 'xp', v_xp,
    'level', game_level(v_total), 'total_xp', v_total, 'has_proof', v_has_proof);
end;
$$;

-- The day a submit applies to: the last timer session's start day (so work past midnight stays on its day),
-- if that is today or yesterday and not already submitted; otherwise today.
create or replace function startup_submit_date() returns date language sql stable as $$
  select coalesce((
    select s.d from (select (start_at at time zone 'America/New_York')::date d from startup_sessions order by start_at desc limit 1) s
    where s.d >= startup_today() - 1
      and not exists(select 1 from startup_daily_results r where r.log_date = s.d and r.submitted_at is not null)
  ), startup_today())
$$;

create or replace function get_startup_submit_preview() returns jsonb language plpgsql stable as $$
declare v_day date := startup_submit_date();
begin
  return jsonb_build_object(
    'date', v_day, 'label', to_char(v_day, 'Dy Mon FMDD'), 'is_today', v_day = startup_today(),
    'hours', round(startup_day_minutes(v_day) / 60.0, 1),
    'todos_done', (select count(*) from startup_todos where day = v_day and done),
    'todos_open', (select count(*) from startup_todos where day = v_day and not done),
    'proof', coalesce((select jsonb_agg(text order by id) from startup_proof where log_date = v_day), '[]'::jsonb),
    'sessions_seen', (select count(*) from claude_sessions where day = v_day),
    'projects', coalesce((select jsonb_agg(name order by (status = 'Parked'), id) from startup_projects), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'name', name, 'unit', unit) order by sort)
                       from game_tasks where active and key not in ('hour_worked', 'win_day')), '[]'::jsonb)
  );
end;
$$;

-- Records the by-hand "outside work", closes the day, and returns everything Claude needs for the breakdown.
create or replace function startup_submit_day(p_date text default null, p_outside jsonb default '[]'::jsonb)
returns jsonb language plpgsql as $$
declare v_day date := coalesce(nullif(nullif(trim(coalesce(p_date, '')), ''), 'null')::date, startup_submit_date());
declare v_item jsonb;
declare v_what text;
declare v_proof text;
declare v_type text;
declare v_project text;
declare v_text text;
declare v_game jsonb;
declare v_final jsonb;
declare v_from timestamptz;
declare v_to timestamptz;
begin
  if exists(select 1 from startup_sessions where stop_at is null
             and (start_at at time zone 'America/New_York')::date = v_day) then
    perform stop_startup_session();
  end if;

  for v_item in select * from jsonb_array_elements(case when jsonb_typeof(p_outside) = 'array' then p_outside else '[]'::jsonb end) loop
    v_what := nullif(trim(coalesce(v_item->>'what', '')), '');
    continue when v_what is null;
    v_proof := nullif(trim(coalesce(v_item->>'proof', '')), '');
    v_type := coalesce(nullif(trim(coalesce(v_item->>'type', '')), ''), 'other');
    v_project := nullif(trim(coalesce(v_item->>'project', '')), '');
    v_text := v_what || coalesce(' — proof: ' || v_proof, '');
    if v_type <> 'other' then
      select name || ': ' || v_text into v_text from game_tasks where key = v_type and key not in ('hour_worked', 'win_day');
      v_text := coalesce(v_text, v_what || coalesce(' — proof: ' || v_proof, ''));
    end if;
    continue when exists(select 1 from startup_proof where log_date = v_day and text = v_text);  -- retry-safe
    if v_type <> 'other' and exists(select 1 from game_tasks where key = v_type and key not in ('hour_worked', 'win_day')) then
      v_game := log_game_task(v_type, v_item->>'quantity', left(v_text, 200), 'submit', v_project);
      update game_task_log set log_date = v_day where id = (v_game->>'id')::bigint;
    end if;
    perform log_startup_proof(v_text, v_project, v_day);
  end loop;

  v_final := finalize_startup_day(null, v_day);
  v_from := v_day::timestamp at time zone 'America/New_York';
  v_to := greatest((v_day + 1)::timestamp at time zone 'America/New_York',
    (select max(stop_at) from startup_sessions where (start_at at time zone 'America/New_York')::date = v_day));

  return jsonb_build_object(
    'ok', true, 'date', v_day, 'label', to_char(v_day, 'Dy Mon FMDD'), 'result', v_final->>'result',
    'from_utc', to_char(v_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'to_utc', to_char(v_to at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'data', jsonb_build_object(
      'date', to_char(v_day, 'Day Mon FMDD'), 'result', v_final->>'result',
      'timer_hours', round(startup_day_minutes(v_day) / 60.0, 1),
      'timer_sessions', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'start', startup_clock(start_at),
          'stop', startup_clock(stop_at), 'minutes', round(extract(epoch from (coalesce(stop_at, now()) - start_at)) / 60)) order by start_at)
        from startup_sessions where (start_at at time zone 'America/New_York')::date = v_day), '[]'::jsonb),
      'todos_done', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'text', text) order by id)
        from startup_todos where done and day = v_day), '[]'::jsonb),
      'todos_not_done', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'text', text) order by id)
        from startup_todos where not done and day = v_day), '[]'::jsonb),
      'proof', coalesce((select jsonb_agg(text order by id) from startup_proof where log_date = v_day), '[]'::jsonb),
      'logged_tasks', coalesce((select jsonb_agg(jsonb_build_object('task', task_name, 'quantity', quantity, 'note', note, 'project', project) order by id)
        from game_task_log where log_date = v_day and undone_at is null and task_key not in ('hour_worked', 'win_day')), '[]'::jsonb),
      'claude_sessions', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'active_minutes', minutes, 'summary', summary) order by updated_at)
        from claude_sessions where day = v_day), '[]'::jsonb),
      'tomorrow_todos', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'text', text) order by id)
        from startup_todos where not done and day = v_day + 1), '[]'::jsonb),
      'other_open_project_todos', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'text', text))
        from (select project, text from startup_todos where not done and (day is null or day < v_day) order by id desc limit 10) o), '[]'::jsonb)
    ));
end;
$$;

create or replace function save_startup_breakdown(p_date text, p_text text) returns jsonb language plpgsql as $$
begin
  update startup_daily_results
     set breakdown = nullif(trim(coalesce(p_text, '')), ''), submitted_at = now()
   where log_date = p_date::date;
  if not found then return jsonb_build_object('ok', false, 'reason', 'day not closed'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function get_dashboard_home() returns jsonb language plpgsql stable as $$
declare v_today date := startup_today();
declare v_submit date := startup_submit_date();
declare v_state jsonb := get_game_state();
begin
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
                   jsonb_agg(jsonb_build_object('id', id, 'text', text, 'done', done) order by done, id) items
            from startup_todos where day = v_today group by project) g), '[]'::jsonb),
    'backlog', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'project', project, 'text', text, 'day', day) order by project, id)
      from startup_todos where not done and (day is null or day < v_today)), '[]'::jsonb),
    'proof', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'project', project) order by id)
                       from startup_proof where log_date = v_today), '[]'::jsonb),
    'result', startup_day_result(v_today),
    'xp_today', v_state->'today'->'xp',
    'win_waiting', v_state->'today'->'win_waiting',
    'tomorrow', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'project', project, 'text', text) order by id)
                          from startup_todos where day = v_today + 1 and not done), '[]'::jsonb),
    'tomorrow_schedule', coalesce((
      select jsonb_agg(jsonb_build_object('title', title, 'start', start_time, 'end', end_time, 'place', place) order by start_time)
      from schedule_items where log_date = v_today + 1), '[]'::jsonb),
    'submit', jsonb_build_object(
      'date', v_submit, 'label', to_char(v_submit, 'Dy Mon FMDD'),
      'has_work', exists(select 1 from startup_sessions where (start_at at time zone 'America/New_York')::date = v_submit)
        or exists(select 1 from startup_proof where log_date = v_submit)
        or exists(select 1 from startup_todos where day = v_submit and done),
      'done', exists(select 1 from startup_daily_results where log_date = v_submit and submitted_at is not null)),
    'last_breakdown', (select jsonb_build_object('date', log_date, 'label', to_char(log_date, 'Dy Mon FMDD'), 'result', result, 'text', breakdown)
       from startup_daily_results where submitted_at is not null and log_date >= v_today - 1 order by submitted_at desc limit 1)
  );
end;
$$;

create or replace function get_dashboard_projects() returns jsonb language plpgsql stable as $$
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
      'open_items', (select count(*) from startup_todos where project = p.name and not done),
      'done_items', (select count(*) from startup_todos where project = p.name and done),
      'todos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'day', day) order by day nulls last, id)
                         from startup_todos where project = p.name and not done), '[]'::jsonb),
      'recent_done', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'day', day,
                           'proof', exists(select 1 from startup_proof pr where pr.todo_id = t.id)) order by done_at desc)
                         from (select * from startup_todos where project = p.name and done order by done_at desc nulls last limit 5) t), '[]'::jsonb),
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

-- History's day view also shows the submitted breakdown.
create or replace function dashboard_get_day(p_token text, p_date text default null) returns jsonb language plpgsql as $$
declare v_day date := coalesce(nullif(nullif(trim(coalesce(p_date, '')), ''), 'null')::date, startup_today());
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true) || get_dashboard_day(p_date)
    || jsonb_build_object('breakdown', (select breakdown from startup_daily_results where log_date = v_day));
end;
$$;

drop function if exists dashboard_todo_done(text, text, text);
create or replace function dashboard_todo_done(p_token text, p_id text, p_done text default 'true', p_proof text default null)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return complete_startup_todo_with_proof(p_id, p_done, p_proof);
end;
$$;

create or replace function dashboard_schedule_todo(p_token text, p_id text, p_day text) returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return schedule_startup_todo(p_id, p_day);
end;
$$;

create or replace function dashboard_submit_preview(p_token text) returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true) || get_startup_submit_preview();
end;
$$;

create or replace function dashboard_submit(p_token text, p_date text default null, p_outside jsonb default '[]'::jsonb)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return startup_submit_day(p_date, p_outside);
end;
$$;

create or replace function dashboard_save_breakdown(p_token text, p_date text, p_text text) returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return save_startup_breakdown(p_date, p_text);
end;
$$;

-- Called by the Claude Code hook on Mark's PC, with its own secret (not the dashboard password).
create or replace function ingest_claude_session(p_secret text, p_session_id text, p_day text, p_project text, p_minutes int, p_summary text)
returns jsonb language plpgsql as $$
begin
  -- "is distinct from" so a missing stored secret refuses everyone instead of accepting everyone
  if p_secret is null or p_secret is distinct from (select value from dashboard_settings where key = 'claude_hook_secret') then
    return jsonb_build_object('ok', false, 'reason', 'bad secret');
  end if;
  insert into claude_sessions (session_id, day, project, minutes, summary, updated_at)
  values (left(p_session_id, 100), p_day::date, left(coalesce(p_project, 'Claude session'), 80), greatest(coalesce(p_minutes, 0), 0), left(coalesce(p_summary, ''), 4000), now())
  on conflict (session_id, day) do update set
    project = excluded.project, minutes = excluded.minutes, summary = excluded.summary, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- New and re-created functions are for the server only.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('startup_parse_day', 'schedule_startup_todo', 'log_startup_proof',
      'complete_startup_todo_with_proof', 'finalize_startup_day', 'startup_submit_date', 'get_startup_submit_preview',
      'startup_submit_day', 'save_startup_breakdown', 'dashboard_todo_done', 'dashboard_schedule_todo',
      'dashboard_submit_preview', 'dashboard_submit', 'dashboard_save_breakdown', 'ingest_claude_session')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

commit;
