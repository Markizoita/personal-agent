-- The Climb (Start Up Ops game): XP, levels, powers, titles, daily score,
-- streak, weather. Metrics only - no mountain visual yet.
-- Rules: GAME-INSTRUCTIONS.md (The Climb). Safe to re-run.

-- ---------- tables (approved by Mark 2026-11-26) ----------

-- The task/XP price list. Edit rows any time; a new price only affects new logs.
create table if not exists game_tasks (
  key text primary key,
  name text not null,
  power text not null,               -- Work / Shipping / Selling / Earning (new word = new power)
  xp numeric not null,               -- XP per unit
  unit text not null,                -- 'per hour' | 'per day' | 'per time' | 'per $1'
  active boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now()
);

insert into game_tasks (key, name, power, xp, unit, sort) values
  ('hour_worked', 'Hour worked',            'Work',     5,  'per hour', 10),
  ('win_day',     'Win day',                'Work',     20, 'per day',  20),
  ('milestone',   'Finished a milestone',   'Shipping', 25, 'per time', 30),
  ('shipped',     'Shipped something',      'Shipping', 50, 'per time', 40),
  ('follow_up',   'Follow-up sent',         'Selling',  10, 'per time', 50),
  ('meeting',     'Meeting or reply booked','Selling',  20, 'per time', 60),
  ('pitched',     'Pitched someone',        'Selling',  30, 'per time', 70),
  ('demo',        'Demo given',             'Selling',  40, 'per time', 80),
  ('money',       'Money earned',           'Earning',  1,  'per $1',   90)
on conflict (key) do nothing;

-- Every logged task, with the XP it earned at the time (never re-scored).
create table if not exists game_task_log (
  id bigserial primary key,
  log_date date not null default (now() at time zone 'America/New_York')::date,
  task_key text not null references game_tasks(key),
  task_name text not null,
  power text not null,
  quantity numeric not null default 1,
  xp numeric(10,2) not null,
  source text not null default 'telegram',   -- telegram | timer | proof | claude | test
  note text,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists game_task_log_date_idx on game_task_log (log_date) where undone_at is null;

grant all on table public.game_tasks, public.game_task_log to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------- helpers ----------

-- Totals start fresh from this day; earlier days don't count for streak/average.
create or replace function game_start_date()
returns date language sql immutable as $$ select date '2026-11-26' $$;

create or replace function game_level(p_xp numeric)
returns int language sql immutable as $$ select floor(coalesce(p_xp, 0) / 100)::int + 1 $$;

create or replace function game_total_xp()
returns numeric language sql stable as $$
  select coalesce(sum(xp), 0) from game_task_log where undone_at is null
$$;

create or replace function game_day_xp(p_day date)
returns numeric language sql stable as $$
  select coalesce(sum(xp), 0) from game_task_log where undone_at is null and log_date = p_day
$$;

-- Result for one day: Win (proof) / Showed up (10+ min) / Miss / Off / Now (today, undecided) / null (future or before start).
create or replace function game_day_result(p_day date)
returns text language plpgsql stable as $$
declare v_today date := startup_today();
declare v_off boolean;
declare v_proof boolean;
declare v_minutes numeric;
declare v_weekend boolean := extract(isodow from p_day) > 5;
begin
  if p_day > v_today or p_day < game_start_date() then return null; end if;
  select coalesce(bool_or(result = 'Off'), false) into v_off from startup_daily_results where log_date = p_day;
  if v_off then return 'Off'; end if;
  select exists(select 1 from startup_proof where log_date = p_day) into v_proof;
  if v_proof then return 'Win'; end if;
  select coalesce(sum(extract(epoch from (coalesce(stop_at, now()) - start_at)) / 60.0), 0) into v_minutes
    from startup_sessions where (start_at at time zone 'America/New_York')::date = p_day;
  if p_day = v_today then
    return case when v_weekend and v_minutes = 0 then 'Off' else 'Now' end;
  end if;
  if v_weekend and v_minutes = 0 then return 'Off'; end if;   -- weekends are Off unless the timer ran
  if v_minutes >= 10 then return 'Showed up'; end if;
  return 'Miss';
end;
$$;

-- Wins in a row, skipping Off days; today only counts once it's a Win.
create or replace function game_streak()
returns int language plpgsql stable as $$
declare v_day date := startup_today();
declare v_r text;
declare v_n int := 0;
begin
  while v_day >= game_start_date() loop
    v_r := game_day_result(v_day);
    if v_r = 'Win' then v_n := v_n + 1;
    elsif v_r in ('Off', 'Now') then null;
    else exit;
    end if;
    v_day := v_day - 1;
  end loop;
  return v_n;
end;
$$;

-- Clear on a streak (or no history yet), Clouds after a miss/non-win day, Storm after two misses in a row.
create or replace function game_weather()
returns text language plpgsql stable as $$
declare v_day date := startup_today();
declare v_r text;
declare v_last text[] := '{}';
begin
  while v_day >= game_start_date() and coalesce(array_length(v_last, 1), 0) < 2 loop
    v_r := game_day_result(v_day);
    if v_r in ('Win', 'Showed up', 'Miss') then v_last := v_last || v_r; end if;
    v_day := v_day - 1;
  end loop;
  if coalesce(array_length(v_last, 1), 0) = 0 or v_last[1] = 'Win' then return 'Clear skies'; end if;
  if v_last[1] = 'Miss' and coalesce(v_last[2], '') = 'Miss' then return 'Storm'; end if;
  return 'Clouds';
end;
$$;

-- Average XP over the last 14 weekdays before today that weren't Off (since game start). Null if none yet.
create or replace function game_avg_day()
returns numeric language plpgsql stable as $$
declare v_day date := startup_today() - 1;
declare v_sum numeric := 0;
declare v_n int := 0;
begin
  while v_day >= game_start_date() and v_n < 14 loop
    if extract(isodow from v_day) <= 5 and coalesce(game_day_result(v_day), 'Off') <> 'Off' then
      v_sum := v_sum + game_day_xp(v_day);
      v_n := v_n + 1;
    end if;
    v_day := v_day - 1;
  end loop;
  if v_n = 0 then return null; end if;
  return round(v_sum / v_n);
end;
$$;

-- Titles: earned once, kept, any order. Counted from the log (as of p_as_of, default now).
create or replace function game_titles(p_before date default null)
returns jsonb language plpgsql stable as $$
declare v_cut date := coalesce(p_before, date '9999-12-31');
declare v_win_days int;
declare v_first_win date;
declare v_fifth_win date;
declare v_ship date;
declare v_sell date;
declare v_earn date;
declare v_four int;
declare v_founder date;
begin
  select count(distinct log_date), min(log_date) into v_win_days, v_first_win
    from game_task_log where undone_at is null and task_key = 'win_day' and log_date < v_cut;
  select d into v_fifth_win from (
    select distinct log_date d from game_task_log
    where undone_at is null and task_key = 'win_day' and log_date < v_cut order by 1 offset 4 limit 1) s;
  select min(log_date) into v_ship from game_task_log where undone_at is null and power = 'Shipping' and log_date < v_cut;
  select min(log_date) into v_sell from game_task_log where undone_at is null and power = 'Selling' and log_date < v_cut;
  select min(log_date) into v_earn from game_task_log where undone_at is null and power = 'Earning' and log_date < v_cut;
  v_four := (v_first_win is not null)::int + (v_fifth_win is not null)::int + (v_ship is not null)::int + (v_sell is not null)::int;
  if v_four = 4 and v_earn is not null then
    v_founder := greatest(v_first_win, v_fifth_win, v_ship, v_sell, v_earn);
  end if;

  return jsonb_build_array(
    jsonb_build_object('key', 'showing_up', 'name', 'Showing Up', 'rank', 1, 'needs', 'Your first Win day',
      'earned', v_first_win is not null, 'earned_on', v_first_win, 'progress', least(v_win_days, 1) || ' of 1'),
    jsonb_build_object('key', 'builder', 'name', 'Builder', 'rank', 2, 'needs', '5 Win days',
      'earned', v_fifth_win is not null, 'earned_on', v_fifth_win, 'progress', least(v_win_days, 5) || ' of 5'),
    jsonb_build_object('key', 'shipper', 'name', 'Shipper', 'rank', 3, 'needs', 'Ship something once',
      'earned', v_ship is not null, 'earned_on', v_ship, 'progress', (v_ship is not null)::int || ' of 1'),
    jsonb_build_object('key', 'seller', 'name', 'Seller', 'rank', 4, 'needs', 'Pitch someone once',
      'earned', v_sell is not null, 'earned_on', v_sell, 'progress', (v_sell is not null)::int || ' of 1'),
    jsonb_build_object('key', 'founder', 'name', 'Founder', 'rank', 5, 'needs', 'The other four, plus your first dollar',
      'earned', v_founder is not null, 'earned_on', v_founder,
      'progress', case when v_four = 4 and v_earn is null then 'Needs first dollar' else v_four || ' of 4' end)
  );
end;
$$;

create or replace function game_power_xp(p_power text, p_before date default null)
returns numeric language sql stable as $$
  select coalesce(sum(xp), 0) from game_task_log
  where undone_at is null and power = p_power and log_date < coalesce(p_before, date '9999-12-31')
$$;

-- ---------- writes ----------

-- Log one task. p_task = key or (part of) the name; p_quantity = hours / dollars / count (default 1).
-- Returns what was logged plus any level-up / power level-up / new title, so the reply can say so once.
create or replace function log_game_task(p_task text, p_quantity text default null, p_note text default null, p_source text default 'telegram')
returns jsonb language plpgsql as $$
declare v_q text := nullif(nullif(trim(coalesce(p_task, '')), ''), 'null');
declare v_qty numeric := coalesce(nullif(nullif(trim(coalesce(p_quantity, '')), ''), 'null')::numeric, 1);
declare v_note text := nullif(nullif(trim(coalesce(p_note, '')), ''), 'null');
declare v_src text := coalesce(nullif(nullif(trim(coalesce(p_source, '')), ''), 'null'), 'telegram');
declare v_task game_tasks;
declare v_today date := startup_today();
declare v_before_total numeric;
declare v_before_power numeric;
declare v_before_titles jsonb;
declare v_after_titles jsonb;
declare v_id bigint;
declare v_xp numeric;
declare v_total numeric;
declare v_power numeric;
begin
  select * into v_task from game_tasks
   where active and (key = lower(v_q) or name ilike v_q)
   limit 1;
  if v_task.key is null then
    select * into v_task from game_tasks
     where active and (name ilike '%' || v_q || '%' or key ilike '%' || replace(lower(v_q), ' ', '_') || '%')
     order by sort limit 1;
  end if;
  if v_task.key is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown task',
      'tasks', (select jsonb_agg(jsonb_build_object('key', key, 'name', name, 'power', power, 'xp', xp, 'unit', unit) order by sort) from game_tasks where active));
  end if;
  if v_qty <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'quantity must be more than 0');
  end if;
  if v_task.key = 'win_day' then
    v_qty := 1;
    if exists(select 1 from game_task_log where undone_at is null and task_key = 'win_day' and log_date = v_today) then
      return jsonb_build_object('ok', false, 'reason', 'win day already logged today');
    end if;
  end if;

  v_before_total := game_total_xp();
  v_before_power := game_power_xp(v_task.power);
  v_before_titles := game_titles();

  v_xp := round(v_task.xp * v_qty, 2);
  insert into game_task_log (log_date, task_key, task_name, power, quantity, xp, source, note)
  values (v_today, v_task.key, v_task.name, v_task.power, v_qty, v_xp, v_src, v_note)
  returning id into v_id;

  v_total := v_before_total + v_xp;
  v_power := v_before_power + v_xp;
  v_after_titles := game_titles();

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'task', v_task.name, 'power', v_task.power, 'quantity', v_qty, 'xp', v_xp,
    'total_xp', v_total, 'level', game_level(v_total), 'xp_to_next', game_level(v_total) * 100 - v_total,
    'level_up', game_level(v_total) > game_level(v_before_total),
    'power_level', game_level(v_power),
    'power_level_up', game_level(v_power) > game_level(v_before_power),
    'today_xp', game_day_xp(v_today),
    'new_titles', coalesce((select jsonb_agg(a->>'name') from jsonb_array_elements(v_after_titles) a
                            where (a->>'earned')::boolean and not exists (
                              select 1 from jsonb_array_elements(v_before_titles) b
                              where b->>'key' = a->>'key' and (b->>'earned')::boolean)), '[]'::jsonb)
  );
end;
$$;

-- Undo a logged task by id (from the reply). Keeps the row, marks it undone.
create or replace function undo_game_task(p_id text)
returns jsonb language plpgsql as $$
declare v_id bigint := nullif(regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g'), '')::bigint;
declare v_row game_task_log;
begin
  update game_task_log set undone_at = now() where id = v_id and undone_at is null returning * into v_row;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not found or already undone');
  end if;
  return jsonb_build_object('ok', true, 'id', v_row.id, 'task', v_row.task_name, 'xp_removed', v_row.xp,
    'total_xp', game_total_xp(), 'level', game_level(game_total_xp()), 'today_xp', game_day_xp(startup_today()));
end;
$$;

-- ---------- reads ----------

-- Everything the game screen and /game need, in one call.
create or replace function get_game_state()
returns jsonb language plpgsql stable as $$
declare v_today date := startup_today();
declare v_week_start date := v_today - (extract(isodow from v_today)::int - 1);
declare v_total numeric := game_total_xp();
declare v_titles jsonb := game_titles();
declare v_top jsonb;
declare v_powers jsonb;
declare v_week jsonb;
declare v_today_tasks jsonb;
declare v_win_today boolean;
declare v_win_xp numeric;
begin
  select a into v_top from jsonb_array_elements(v_titles) a
   where (a->>'earned')::boolean order by (a->>'rank')::int desc limit 1;

  select jsonb_agg(jsonb_build_object(
           'power', p.power, 'xp', p.xp, 'level', game_level(p.xp),
           'xp_into_level', p.xp - (game_level(p.xp) - 1) * 100,
           'xp_to_next', game_level(p.xp) * 100 - p.xp,
           'level_at_week_start', game_level(game_power_xp(p.power, v_week_start)))
         order by coalesce(array_position(array['Work','Selling','Shipping','Earning'], p.power), 99), p.ord)
    into v_powers
    from (select power, min(sort) ord, game_power_xp(power) xp from game_tasks group by power) p;

  select coalesce(jsonb_agg(jsonb_build_object('task', task_name, 'power', power, 'quantity', q, 'xp', x) order by first_id), '[]'::jsonb)
    into v_today_tasks
    from (select task_key, task_name, power, sum(quantity) q, sum(xp) x, min(id) first_id
          from game_task_log where undone_at is null and log_date = v_today
          group by task_key, task_name, power) t;

  select exists(select 1 from game_task_log where undone_at is null and task_key = 'win_day' and log_date = v_today) into v_win_today;
  select xp into v_win_xp from game_tasks where key = 'win_day';

  select jsonb_agg(jsonb_build_object(
           'date', d::date, 'day', to_char(d, 'Dy'),
           'result', game_day_result(d::date),
           'xp', case when d::date <= v_today and d::date >= game_start_date() then game_day_xp(d::date) end)
         order by d)
    into v_week
    from generate_series(v_week_start, v_week_start + 6, interval '1 day') d;

  return jsonb_build_object(
    'title', v_top->>'name',
    'level', game_level(v_total),
    'total_xp', v_total,
    'xp_into_level', v_total - (game_level(v_total) - 1) * 100,
    'xp_to_next', game_level(v_total) * 100 - v_total,
    'streak', game_streak(),
    'weather', game_weather(),
    'today', jsonb_build_object(
      'date', v_today,
      'xp', game_day_xp(v_today),
      'avg_day', game_avg_day(),
      'result', game_day_result(v_today),
      'tasks', v_today_tasks,
      'win_waiting', case when not v_win_today and game_day_result(v_today) <> 'Off' then v_win_xp end),
    'powers', v_powers,
    'titles', v_titles,
    'titles_earned', (select count(*) from jsonb_array_elements(v_titles) a where (a->>'earned')::boolean),
    'week', v_week,
    'week_summary', jsonb_build_object(
      'xp', (select coalesce(sum(xp), 0) from game_task_log where undone_at is null and log_date >= v_week_start and log_date <= v_today),
      'titles_earned', (select coalesce(jsonb_agg(a->>'name'), '[]'::jsonb) from jsonb_array_elements(v_titles) a
                        where (a->>'earned')::boolean and (a->>'earned_on')::date >= v_week_start)),
    'task_table', (select jsonb_agg(jsonb_build_object('key', key, 'name', name, 'power', power, 'xp', xp, 'unit', unit) order by sort)
                   from game_tasks where active)
  );
end;
$$;

grant execute on all functions in schema public to service_role;

-- ---------- hook the existing Start Up functions into the game ----------

-- Stopping the timer logs the hours worked.
create or replace function stop_startup_session()
returns jsonb language plpgsql as $$
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
    v_game := log_game_task('hour_worked', round(v_minutes / 60.0, 4)::text, v_session.project, 'timer');
  end if;
  return jsonb_build_object('ok', true, 'project', v_session.project, 'minutes', v_minutes, 'game', v_game);
end;
$$;

-- The first proof of the day makes it a Win day (+20 XP, once).
create or replace function log_startup_proof(p_text text, p_project text default null)
returns jsonb language plpgsql as $$
declare v_game jsonb;
begin
  insert into startup_proof (log_date, project, text)
  values (startup_today(), nullif(nullif(trim(coalesce(p_project, '')), ''), 'null'), trim(p_text));
  if not exists(select 1 from game_task_log where undone_at is null and task_key = 'win_day' and log_date = startup_today()) then
    v_game := log_game_task('win_day', '1', left(trim(p_text), 200), 'proof');
  end if;
  return jsonb_build_object('ok', true, 'game', v_game);
end;
$$;

-- New daily result rules (no hour goal, no level drops). Win = proof logged.
create or replace function finalize_startup_day(p_off_reason text default null)
returns jsonb language plpgsql as $$
declare v_today date := startup_today();
declare v_off text := nullif(nullif(trim(coalesce(p_off_reason, '')), ''), 'null');
declare v_minutes int := startup_minutes_today();
declare v_has_proof boolean;
declare v_result text;
declare v_xp numeric;
declare v_total numeric := game_total_xp();
declare v_title text;
begin
  select exists(select 1 from startup_proof where log_date = v_today) into v_has_proof;
  v_result := case
    when v_off is not null then 'Off'
    when v_has_proof then 'Win'
    when v_minutes >= 10 then 'Showed up'
    else 'Miss' end;
  v_xp := game_day_xp(v_today);

  insert into startup_daily_results (log_date, minutes, result, off_reason, level, xp, wrapped)
  values (v_today, v_minutes, v_result, v_off, game_level(v_total), round(v_xp), true)
  on conflict (log_date) do update set
    minutes = v_minutes, result = v_result, off_reason = v_off,
    level = game_level(v_total), xp = round(v_xp), wrapped = true;

  select a->>'name' into v_title from jsonb_array_elements(game_titles()) a
   where (a->>'earned')::boolean order by (a->>'rank')::int desc limit 1;

  return jsonb_build_object('ok', true, 'result', v_result, 'minutes', v_minutes,
    'xp', v_xp, 'level', game_level(v_total), 'title', v_title, 'total_xp', v_total,
    'has_proof', v_has_proof, 'streak', game_streak(), 'avg_day', game_avg_day());
end;
$$;

-- get_daily_form's `startup` field: game summary replaces the old level/goal.
create or replace function get_startup_today()
returns jsonb language plpgsql as $$
declare v_today date := startup_today();
declare v_state jsonb := get_game_state();
begin
  return jsonb_build_object(
    'game', jsonb_build_object(
      'title', v_state->>'title', 'level', (v_state->>'level')::int, 'total_xp', (v_state->>'total_xp')::numeric,
      'xp_to_next', (v_state->>'xp_to_next')::numeric, 'today_xp', (v_state->'today'->>'xp')::numeric,
      'avg_day', v_state->'today'->'avg_day', 'streak', (v_state->>'streak')::int, 'weather', v_state->>'weather',
      'today_tasks', v_state->'today'->'tasks', 'win_waiting', v_state->'today'->'win_waiting',
      'week_summary', v_state->'week_summary', 'powers', v_state->'powers', 'titles', v_state->'titles'),
    'open_session', get_startup_open_session(),
    'minutes_today', startup_minutes_today(),
    'result', (select result from startup_daily_results where log_date = v_today),
    'todos_today', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'project', project, 'text', text, 'tag', tag, 'done', done) order by id)
      from startup_todos where day = v_today), '[]'::jsonb),
    'todos_tomorrow', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'project', project, 'text', text) order by id)
      from startup_todos where day = v_today + 1), '[]'::jsonb),
    'proof_today', coalesce((select jsonb_agg(text) from startup_proof where log_date = v_today), '[]'::jsonb)
  );
end;
$$;

grant execute on all functions in schema public to service_role;
