-- Exercises every dashboard read and action with sample activity, then raises the
-- results as an error so EVERYTHING rolls back.  node supabase_sql.js dashboard_test.sql
do $$
declare r jsonb := '{}';
declare x jsonb;
declare v_todo bigint;
declare v_today date := startup_today();
begin
  -- sample: 2 projects, yesterday's work + proof, today running session, to-dos, a ship
  perform set_startup_project('Project #1', 'Testing');
  r := r || jsonb_build_object('a_set_project', set_startup_project('Own products', 'Parked'));
  insert into startup_sessions (project, start_at, stop_at) values
    ('Personal agent', ((v_today - 1) + time '08:30') at time zone 'America/New_York', ((v_today - 1) + time '13:30') at time zone 'America/New_York'),
    ('Project #1',     ((v_today - 1) + time '14:00') at time zone 'America/New_York', ((v_today - 1) + time '16:00') at time zone 'America/New_York');
  insert into startup_proof (log_date, project, text) values (v_today - 1, 'Personal agent', 'Wake Proof built');
  insert into startup_todos (project, text, day, tag, done) values ('Personal agent', 'Build Wake Proof', v_today - 1, 'planned', true),
                                                                  ('Personal agent', 'Outline Start Up', v_today - 1, 'planned', false);

  x := add_startup_todo('Personal agent', 'Test the 8 AM check-in', 'today', 'planned');  v_todo := (x->>'id')::bigint;
  perform add_startup_todo('Project #1', 'Write down steps', 'today', 'carried');
  perform add_startup_todo('Project #1', 'Run second manual test', 'tomorrow', 'planned');
  insert into startup_sessions (project, start_at) values ('Personal agent', now() - interval '50 minutes');
  -- start on another project while one runs -> previous one is stopped and earns hours XP
  x := start_startup_session('Project #1', 'build');
  r := r || jsonb_build_object('b_switch_project', jsonb_build_object('project', x->'project', 'prev_minutes', x->'stopped_previous'->'minutes', 'prev_xp', x->'stopped_previous'->'game'->'xp'));
  r := r || jsonb_build_object('c_tick', set_startup_todo_done(v_todo::text, 'true'));
  r := r || jsonb_build_object('c_untick', set_startup_todo_done(v_todo::text, 'false')->'done');
  perform set_startup_todo_done(v_todo::text, 'true');
  r := r || jsonb_build_object('c_delete_missing', delete_startup_todo('999999')->'reason');
  x := log_startup_proof('Finance check-in working', 'Personal agent');
  x := log_game_task('shipped', null, 'finance check-in', 'test', 'Personal agent');
  r := r || jsonb_build_object('d_ship_project', x->'ok');

  r := r || jsonb_build_object('home', get_dashboard_home());
  x := get_dashboard_progress('week');
  r := r || jsonb_build_object('progress_week', jsonb_build_object('label', x->'label', 'from', x->'from', 'metrics', x->'metrics', 'game_level', x->'game'->'level', 'game_title', x->'game'->'title'));
  r := r || jsonb_build_object('progress_month_label', get_dashboard_progress('month')->'label', 'progress_all_label', get_dashboard_progress('all')->'label');
  r := r || jsonb_build_object('projects', get_dashboard_projects());
  r := r || jsonb_build_object('history', get_dashboard_history('7'));
  r := r || jsonb_build_object('day_yesterday', get_dashboard_day((v_today - 1)::text));
  r := r || jsonb_build_object('off_today', set_startup_off_day('job')->'result');
  raise exception 'TEST_RESULT %', r::text;
end;
$$;
