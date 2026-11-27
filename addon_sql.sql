-- Same-day add-ons: each day keeps every submission as a part (1 = original, 2+ = add-ons). Safe to re-run.
-- Apply after homepage_sql.sql (this replaces some of its functions).
begin;

create table if not exists startup_submissions (
  log_date date not null,
  part int not null,
  submitted_at timestamptz not null default now(),
  breakdown text,
  primary key (log_date, part)
);
alter table startup_submissions enable row level security;

insert into startup_submissions (log_date, part, submitted_at, breakdown)
select log_date, 1, submitted_at, breakdown from startup_daily_results where submitted_at is not null
on conflict do nothing;

-- Anything worth a new add-on since a point in time. A few-second timer tap doesn't count.
create or replace function startup_has_new_work(p_day date, p_since timestamptz) returns boolean language sql stable as $$
  select exists(select 1 from startup_sessions where (start_at at time zone 'America/New_York')::date = p_day
                 and coalesce(stop_at, now()) - greatest(start_at, p_since) >= interval '1 minute')
      or exists(select 1 from startup_proof where log_date = p_day and created_at > p_since)
      or exists(select 1 from startup_todos where day = p_day and done and done_at > p_since)
      or exists(select 1 from game_task_log where log_date = p_day and undone_at is null and created_at > p_since
                 and task_key not in ('hour_worked', 'win_day'))
$$;

-- The submissions of a day, each with the timer stretches that fall in it (read live, so corrected times show).
create or replace function startup_day_parts(p_day date) returns jsonb language sql stable as $$
  with parts as (
    select part, submitted_at, breakdown, lag(submitted_at) over (order by part) as prev
    from startup_submissions where log_date = p_day)
  select coalesce(jsonb_agg(jsonb_build_object('part', p.part, 'submitted', startup_clock(p.submitted_at), 'text', p.breakdown,
           'worked', coalesce(w.times, '[]'::jsonb), 'hours', coalesce(w.hours, 0)) order by p.part), '[]'::jsonb)
  from parts p
  left join lateral (
    select jsonb_agg(startup_clock(s.start_at) || '–' || startup_clock(s.stop_at) order by s.start_at) as times,
           round((sum(extract(epoch from (s.stop_at - s.start_at))) / 3600.0)::numeric, 1) as hours
    from startup_sessions s
    where (s.start_at at time zone 'America/New_York')::date = p_day and s.stop_at - s.start_at >= interval '1 minute'
      and s.stop_at > coalesce(p.prev, '-infinity') and s.stop_at <= p.submitted_at
  ) w on true
$$;

-- The day a submit applies to: the day of the last real timer stretch (today or yesterday) if it ended after
-- that day's last submission, so late-night add-ons stay on their day; otherwise today.
create or replace function startup_submit_date() returns date language sql stable as $$
  select coalesce((
    select s.d from (
      select (start_at at time zone 'America/New_York')::date as d, coalesce(stop_at, now()) as e from startup_sessions
      where stop_at is null or stop_at - start_at >= interval '1 minute' order by start_at desc limit 1) s
    where s.d >= startup_today() - 1
      and not exists(select 1 from startup_daily_results r where r.log_date = s.d and r.submitted_at >= s.e)
  ), startup_today())
$$;

create or replace function get_startup_submit_preview() returns jsonb language plpgsql stable as $$
declare v_day date := startup_submit_date();
declare v_last startup_submissions;
begin
  select * into v_last from startup_submissions where log_date = v_day order by part desc limit 1;
  return jsonb_build_object(
    'date', v_day, 'label', to_char(v_day, 'Dy Mon FMDD'), 'is_today', v_day = startup_today(),
    'hours', round(startup_day_minutes(v_day) / 60.0, 1),
    'todos_done', (select count(*) from startup_todos where day = v_day and done),
    'todos_open', (select count(*) from startup_todos where day = v_day and not done),
    'proof', coalesce((select jsonb_agg(text order by id) from startup_proof where log_date = v_day), '[]'::jsonb),
    'sessions_seen', (select count(*) from claude_sessions where day = v_day),
    'submitted_at', startup_clock(v_last.submitted_at),
    'has_new', v_last.part is not null and (v_last.breakdown is null or startup_has_new_work(v_day, v_last.submitted_at)),
    'projects', coalesce((select jsonb_agg(name order by (status = 'Parked'), id) from startup_projects), '[]'::jsonb),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'name', name, 'unit', unit) order by sort)
                       from game_tasks where active and key not in ('hour_worked', 'win_day')), '[]'::jsonb)
  );
end;
$$;

-- Records the by-hand outside work, closes the day, picks which part this submit is, and returns that part's facts.
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
declare v_last startup_submissions;
declare v_part int;
declare v_prev timestamptz;
declare v_since timestamptz;
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

  select * into v_last from startup_submissions where log_date = v_day order by part desc limit 1;
  v_part := case
    when v_last.part is null then 1
    when v_last.breakdown is null then v_last.part                                      -- the last write failed: redo it
    when startup_has_new_work(v_day, v_last.submitted_at) then v_last.part + 1          -- add-on
    else v_last.part end;                                                               -- nothing new: rewrite it
  select submitted_at into v_prev from startup_submissions where log_date = v_day and part = v_part - 1;
  insert into startup_submissions (log_date, part) values (v_day, v_part) on conflict (log_date, part) do nothing;
  v_since := coalesce(v_prev, '-infinity');

  v_from := coalesce(v_prev, v_day::timestamp at time zone 'America/New_York');
  v_to := greatest((v_day + 1)::timestamp at time zone 'America/New_York',
    (select max(stop_at) from startup_sessions where (start_at at time zone 'America/New_York')::date = v_day));

  return jsonb_build_object(
    'ok', true, 'date', v_day, 'label', to_char(v_day, 'Dy Mon FMDD'), 'result', v_final->>'result', 'part', v_part,
    'from_utc', to_char(v_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'to_utc', to_char(v_to at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'data', jsonb_build_object(
      'date', to_char(v_day, 'Day Mon FMDD'), 'result', v_final->>'result',
      'addon', case when v_part > 1 then jsonb_build_object('number', v_part - 1, 'covers_work_since', startup_clock(v_prev),
          'earlier_breakdowns', (select jsonb_agg(breakdown order by part) from startup_submissions where log_date = v_day and part < v_part)) end,
      'whole_day_timer_hours', round(startup_day_minutes(v_day) / 60.0, 1),
      'timer_sessions', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'start', startup_clock(start_at),
          'stop', startup_clock(stop_at), 'minutes', round(extract(epoch from (coalesce(stop_at, now()) - start_at)) / 60)) order by start_at)
        from startup_sessions where (start_at at time zone 'America/New_York')::date = v_day
          and coalesce(stop_at, now()) > v_since and coalesce(stop_at, now()) - start_at >= interval '1 minute'), '[]'::jsonb),
      'todos_done', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'text', text) order by id)
        from startup_todos where done and day = v_day and (v_prev is null or done_at > v_prev)), '[]'::jsonb),
      'todos_not_done', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'text', text) order by id)
        from startup_todos where not done and day = v_day), '[]'::jsonb),
      'proof', coalesce((select jsonb_agg(text order by id) from startup_proof where log_date = v_day and created_at > v_since), '[]'::jsonb),
      'logged_tasks', coalesce((select jsonb_agg(jsonb_build_object('task', task_name, 'quantity', quantity, 'note', note, 'project', project) order by id)
        from game_task_log where log_date = v_day and undone_at is null and created_at > v_since
          and task_key not in ('hour_worked', 'win_day')), '[]'::jsonb),
      -- for an add-on, only the session notes written after the previous submission ("- HH:MM text" lines)
      'claude_sessions', coalesce((select jsonb_agg(jsonb_build_object('project', c.project, 'summary', n.notes) order by c.updated_at)
        from claude_sessions c
        cross join lateral (select case when v_prev is null then c.summary else (
            select string_agg(l, E'\n') from regexp_split_to_table(c.summary, E'\n') l
            where l ~ '^- [0-9]{2}:[0-9]{2} ' and (v_prev at time zone 'America/New_York')::date = v_day
              and substr(l, 3, 5) > to_char(v_prev at time zone 'America/New_York', 'HH24:MI')) end as notes) n
        where c.day = v_day and coalesce(n.notes, '') <> ''), '[]'::jsonb),
      'tomorrow_todos', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'text', text) order by id)
        from startup_todos where not done and day = v_day + 1), '[]'::jsonb),
      'other_open_project_todos', coalesce((select jsonb_agg(jsonb_build_object('project', project, 'text', text))
        from (select project, text from startup_todos where not done and (day is null or day < v_day) order by id desc limit 10) o), '[]'::jsonb)
    ));
end;
$$;

create or replace function save_startup_breakdown(p_date text, p_text text) returns jsonb language plpgsql as $$
declare v_day date := p_date::date;
begin
  update startup_submissions
     set breakdown = coalesce(nullif(trim(coalesce(p_text, '')), ''), breakdown), submitted_at = clock_timestamp()
   where log_date = v_day and part = (select max(part) from startup_submissions where log_date = v_day);
  if not found then return jsonb_build_object('ok', false, 'reason', 'day not closed'); end if;
  update startup_daily_results
     set breakdown = (select breakdown from startup_submissions where log_date = v_day order by part desc limit 1),
         submitted_at = clock_timestamp()
   where log_date = v_day;
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
      'done', exists(select 1 from startup_submissions where log_date = v_submit)),
    'last_breakdown', (select jsonb_build_object('date', log_date, 'label', to_char(log_date, 'Dy Mon FMDD'), 'result', result,
         'hours', round(startup_day_minutes(log_date) / 60.0, 1), 'parts', startup_day_parts(log_date))
       from startup_daily_results where submitted_at is not null and log_date >= v_today - 1 order by log_date desc limit 1)
  );
end;
$$;

create or replace function dashboard_get_day(p_token text, p_date text default null) returns jsonb language plpgsql as $$
declare v_day date := coalesce(nullif(nullif(trim(coalesce(p_date, '')), ''), 'null')::date, startup_today());
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true) || get_dashboard_day(p_date) || jsonb_build_object('parts', startup_day_parts(v_day));
end;
$$;

commit;
