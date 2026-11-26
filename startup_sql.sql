-- Start Up Ops v1 schema + functions (same Supabase DB as everything else)

create table if not exists startup_projects (
  id bigserial primary key,
  name text not null unique,
  status text not null default 'Building',
  created_at timestamptz not null default now()
);
insert into startup_projects (name, status) values ('Personal agent', 'Building')
on conflict (name) do nothing;

create table if not exists startup_sessions (
  id bigserial primary key,
  project text not null,
  kind text not null default 'build',
  start_at timestamptz not null default now(),
  stop_at timestamptz,
  source text not null default 'telegram'
);

create table if not exists startup_todos (
  id bigserial primary key,
  project text not null,
  text text not null,
  day date not null,
  tag text not null default 'new',
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists startup_proof (
  id bigserial primary key,
  log_date date not null,
  project text,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists startup_daily_results (
  id bigserial primary key,
  log_date date not null unique,
  minutes int not null default 0,
  result text,
  off_reason text,
  level int not null default 2,
  xp int not null default 0,
  wrapped boolean not null default false,
  started_9_checked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists startup_state (
  id int primary key default 1,
  level int not null default 2,
  total_xp int not null default 0,
  check (id = 1)
);
insert into startup_state (id, level, total_xp) values (1, 2, 0) on conflict (id) do nothing;

-- ---------- helpers ----------
create or replace function startup_today()
returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date
$$;

create or replace function startup_goal_minutes(p_level int)
returns int language sql immutable as $$
  select case p_level
    when 1 then 180 when 2 then 240 when 3 then 300 when 4 then 360 when 5 then 420
    else 420 end
$$;

-- ---------- start / stop ----------
create or replace function start_startup_session(p_project text, p_kind text default 'build')
returns jsonb language plpgsql as $$
declare v_project text := nullif(nullif(trim(p_project), ''), 'null');
declare v_kind text := coalesce(nullif(nullif(trim(p_kind), ''), 'null'), 'build');
declare v_id bigint;
begin
  if v_project is null then
    select project into v_project from startup_sessions order by start_at desc limit 1;
    v_project := coalesce(v_project, 'Personal agent');
  end if;
  -- close any stray open session first
  update startup_sessions set stop_at = now() where stop_at is null;
  insert into startup_sessions (project, kind) values (v_project, v_kind) returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'project', v_project, 'start_at', now());
end;
$$;

create or replace function stop_startup_session()
returns jsonb language plpgsql as $$
declare v_session record;
declare v_minutes int;
begin
  select * into v_session from startup_sessions where stop_at is null order by start_at desc limit 1;
  if v_session is null then
    return jsonb_build_object('ok', false, 'reason', 'no open session');
  end if;
  update startup_sessions set stop_at = now() where id = v_session.id;
  v_minutes := round(extract(epoch from (now() - v_session.start_at)) / 60.0);
  return jsonb_build_object('ok', true, 'project', v_session.project, 'minutes', v_minutes);
end;
$$;

create or replace function get_startup_open_session()
returns jsonb language plpgsql as $$
declare v_session record;
begin
  select * into v_session from startup_sessions where stop_at is null order by start_at desc limit 1;
  if v_session is null then
    return jsonb_build_object('open', false);
  end if;
  return jsonb_build_object('open', true, 'project', v_session.project,
    'start_at', v_session.start_at,
    'minutes', round(extract(epoch from (now() - v_session.start_at)) / 60.0));
end;
$$;

create or replace function startup_minutes_today()
returns int language sql stable as $$
  select coalesce(sum(
    extract(epoch from (coalesce(stop_at, now()) - start_at)) / 60.0
  ), 0)::int
  from startup_sessions
  where (start_at at time zone 'America/New_York')::date = startup_today()
$$;

-- ---------- todos ----------
create or replace function add_startup_todo(p_project text, p_text text, p_day text default 'today', p_tag text default 'new')
returns jsonb language plpgsql as $$
declare v_day date;
declare v_tag text := coalesce(nullif(nullif(trim(p_tag), ''), 'null'), 'new');
declare v_id bigint;
begin
  v_day := case lower(coalesce(nullif(nullif(trim(p_day), ''), 'null'), 'today'))
    when 'tomorrow' then startup_today() + 1 else startup_today() end;
  insert into startup_todos (project, text, day, tag) values (trim(p_project), trim(p_text), v_day, v_tag)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function complete_startup_todo(p_match text)
returns jsonb language plpgsql as $$
declare v_id bigint;
begin
  if p_match ~ '^[0-9]+$' then
    v_id := p_match::bigint;
  else
    select id into v_id from startup_todos
    where day = startup_today() and done = false and text ilike '%' || trim(p_match) || '%'
    order by id desc limit 1;
  end if;
  if v_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not found');
  end if;
  update startup_todos set done = true, done_at = now() where id = v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- midnight rollover: call once a day (poller) - tomorrow's items become today's
create or replace function roll_startup_todos()
returns jsonb language plpgsql as $$
begin
  update startup_todos set day = startup_today(), tag = 'planned'
  where day = startup_today() - 1 and done = false;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- proof ----------
create or replace function log_startup_proof(p_text text, p_project text default null)
returns jsonb language plpgsql as $$
begin
  insert into startup_proof (log_date, project, text) values (startup_today(), p_project, trim(p_text));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- 9am no-start check (poller calls this) ----------
create or replace function check_startup_9am()
returns jsonb language plpgsql as $$
declare v_today date := startup_today();
declare v_dow int := extract(isodow from now() at time zone 'America/New_York');
declare v_already boolean;
declare v_started boolean;
begin
  if v_dow > 5 then return jsonb_build_object('due', false); end if;
  if (now() at time zone 'America/New_York')::time < '09:00' then return jsonb_build_object('due', false); end if;
  select started_9_checked into v_already from startup_daily_results where log_date = v_today;
  if coalesce(v_already, false) then return jsonb_build_object('due', false); end if;
  select exists(select 1 from startup_sessions where (start_at at time zone 'America/New_York')::date = v_today) into v_started;
  insert into startup_daily_results (log_date, started_9_checked) values (v_today, true)
    on conflict (log_date) do update set started_9_checked = true;
  if v_started then return jsonb_build_object('due', false); end if;
  return jsonb_build_object('due', true);
end;
$$;

-- ---------- end of day wrap-up (poller or manual stop calls this) ----------
create or replace function finalize_startup_day(p_off_reason text default null)
returns jsonb language plpgsql as $$
declare v_today date := startup_today();
declare v_level int;
declare v_minutes int;
declare v_goal int;
declare v_has_proof boolean;
declare v_result text;
declare v_xp int;
declare v_already_wrapped boolean;
declare v_win_count int;
declare v_dow int := extract(isodow from now() at time zone 'America/New_York');
declare v_off_count int;
begin
  select wrapped into v_already_wrapped from startup_daily_results where log_date = v_today;
  if coalesce(v_already_wrapped, false) then
    return jsonb_build_object('ok', false, 'reason', 'already wrapped today');
  end if;

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

  insert into startup_daily_results (log_date, minutes, result, off_reason, level, xp, wrapped)
  values (v_today, v_minutes, v_result, p_off_reason, v_level, v_xp, true)
  on conflict (log_date) do update set
    minutes = v_minutes, result = v_result, off_reason = p_off_reason,
    level = v_level, xp = v_xp, wrapped = true;

  update startup_state set total_xp = total_xp + v_xp where id = 1;

  -- level up: 5 wins at current level within the last 7 days
  select count(*) into v_win_count from startup_daily_results
  where level = v_level and result = 'Win' and log_date > v_today - 7 and log_date <= v_today;
  if v_win_count >= 5 and v_level < 5 then
    update startup_state set level = v_level + 1 where id = 1;
  end if;

  -- level down: Sunday check on the Mon-Sun week just finished
  if v_dow = 7 then
    select count(*) filter (where result = 'Win') , count(*) filter (where result = 'Off')
      into v_win_count, v_off_count
      from startup_daily_results
      where log_date > v_today - 7 and log_date <= v_today;
    if v_win_count <= 2 and v_off_count < 3 and v_level > 1 then
      update startup_state set level = v_level - 1 where id = 1;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'result', v_result, 'minutes', v_minutes, 'goal', v_goal,
    'xp', v_xp, 'level', v_level);
end;
$$;

-- scheduled-end check: fires once when it's time to wrap up (poller calls this)
create or replace function check_startup_wrapup_due(p_end_time text default '17:00')
returns jsonb language plpgsql as $$
declare v_today date := startup_today();
declare v_dow int := extract(isodow from now() at time zone 'America/New_York');
declare v_wrapped boolean;
begin
  if v_dow > 5 then return jsonb_build_object('due', false); end if;
  select wrapped into v_wrapped from startup_daily_results where log_date = v_today;
  if coalesce(v_wrapped, false) then return jsonb_build_object('due', false); end if;
  if (now() at time zone 'America/New_York')::time < p_end_time::time then
    return jsonb_build_object('due', false);
  end if;
  return jsonb_build_object('due', true);
end;
$$;

-- ---------- display ----------
create or replace function get_startup_today()
returns jsonb language plpgsql as $$
declare v_today date := startup_today();
declare v_level int; v_xp int;
declare v_open jsonb;
declare v_minutes int;
declare v_result record;
begin
  select level, total_xp into v_level, v_xp from startup_state where id = 1;
  v_open := get_startup_open_session();
  v_minutes := startup_minutes_today();
  select * into v_result from startup_daily_results where log_date = v_today;

  return jsonb_build_object(
    'level', v_level, 'total_xp', v_xp, 'goal_minutes', startup_goal_minutes(v_level),
    'open_session', v_open, 'minutes_today', v_minutes,
    'result', coalesce(v_result.result, null),
    'todos_today', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'project', project, 'text', text, 'tag', tag, 'done', done) order by id)
      from startup_todos where day = v_today), '[]'::jsonb),
    'todos_tomorrow', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'project', project, 'text', text) order by id)
      from startup_todos where day = v_today + 1), '[]'::jsonb),
    'proof_today', coalesce((select jsonb_agg(text) from startup_proof where log_date = v_today), '[]'::jsonb)
  );
end;
$$;
