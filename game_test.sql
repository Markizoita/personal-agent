-- Runs The Climb's test list inside one block, then raises the results as an
-- error so EVERYTHING rolls back (no test data left behind).
--   node supabase_sql.js game_test.sql   -> the "error" message is the result JSON
do $$
declare r jsonb := '{}';
declare x jsonb;
declare v_sid bigint;
begin
  -- pretend the game started 10 days ago so multi-day streak/weather can be tested
  create or replace function game_start_date() returns date language sql immutable as $f$ select date '2026-11-16' $f$;
  delete from game_task_log where true;
  delete from startup_proof where log_date >= '2026-11-16';
  delete from startup_daily_results where log_date >= '2026-11-16' and log_date < '2026-11-26';

  -- 1. a task at each power + Seller before Shipper
  x := log_game_task('pitched', null, 'test pitch', 'test');
  r := r || jsonb_build_object('1_pitch', jsonb_build_object('xp', x->'xp', 'power', x->'power', 'new_titles', x->'new_titles', 'level', x->'level'));
  x := log_game_task('follow up', null, null, 'test');
  r := r || jsonb_build_object('1_followup_by_name', jsonb_build_object('task', x->'task', 'xp', x->'xp', 'total', x->'total_xp'));
  x := log_game_task('shipped', null, null, 'test');
  r := r || jsonb_build_object('1_ship_levelup', jsonb_build_object('total', x->'total_xp', 'level', x->'level', 'level_up', x->'level_up', 'new_titles', x->'new_titles'));
  x := log_game_task('money', '50', null, 'test');
  r := r || jsonb_build_object('1_money50', jsonb_build_object('xp', x->'xp', 'power', x->'power', 'new_titles', x->'new_titles'));
  x := log_game_task('hour_worked', '2', null, 'test');
  r := r || jsonb_build_object('1_two_hours', x->'xp');
  x := log_game_task('dance party', null, null, 'test');
  r := r || jsonb_build_object('1_unknown', x->'reason');

  -- 2. price change: old log keeps 10 XP, new one gets 100
  update game_tasks set xp = 100 where key = 'follow_up';
  x := log_game_task('follow_up', null, null, 'test');
  r := r || jsonb_build_object('2_price_change', jsonb_build_object('new_xp', x->'xp', 'power_level_up', x->'power_level_up', 'power_level', x->'power_level',
     'old_rows_xp', (select jsonb_agg(xp order by id) from game_task_log where task_key = 'follow_up')));
  update game_tasks set xp = 10 where key = 'follow_up';

  -- 3. undo
  x := undo_game_task((select max(id) from game_task_log)::text);
  r := r || jsonb_build_object('3_undo', jsonb_build_object('ok', x->'ok', 'removed', x->'xp_removed', 'total', x->'total_xp'));
  r := r || jsonb_build_object('3_undo_again', undo_game_task((select max(id) from game_task_log)::text)->'reason');

  -- 4. Win days: Fri 20, Mon 23, Tue 24, Wed 25 (weekend 21/22 = Off) -> streak 4
  insert into startup_proof (log_date, text) values ('2026-11-20','t'),('2026-11-23','t'),('2026-11-24','t'),('2026-11-25','t');
  insert into game_task_log (log_date, task_key, task_name, power, xp, source)
    select d, 'win_day', 'Win day', 'Work', 20, 'test' from unnest(array['2026-11-20','2026-11-23','2026-11-24','2026-11-25']::date[]) d;
  r := r || jsonb_build_object('4_streak_4_over_weekend', jsonb_build_object('streak', game_streak(), 'weather', game_weather(), 'avg_day', game_avg_day(),
     'titles', (select jsonb_agg((a->>'name') || ':' || (a->>'progress')) from jsonb_array_elements(game_titles()) a)));

  -- 5. today's proof -> Win day once, 5th Win -> Builder, -> Founder (has ship, sell, money)
  x := log_startup_proof('test proof', 'Personal agent');
  r := r || jsonb_build_object('5_proof_today', jsonb_build_object('win_xp', x->'game'->'xp', 'new_titles', x->'game'->'new_titles'));
  x := log_startup_proof('second proof', 'Personal agent');
  r := r || jsonb_build_object('5_second_proof_no_double', x->'game');
  r := r || jsonb_build_object('5_streak_with_today', game_streak());

  -- 6. Off day on Wed keeps streak (skipped), Miss breaks it, two Misses = Storm
  insert into startup_daily_results (log_date, result, off_reason) values ('2026-11-25', 'Off', 'event');
  r := r || jsonb_build_object('6_wed_off', jsonb_build_object('wed', game_day_result('2026-11-25'), 'streak', game_streak()));
  delete from startup_daily_results where log_date = '2026-11-25';
  delete from startup_proof where log_date = '2026-11-25';
  r := r || jsonb_build_object('6_wed_miss', jsonb_build_object('wed', game_day_result('2026-11-25'), 'streak', game_streak(), 'weather', game_weather()));
  delete from startup_proof where log_date in ('2026-11-24', '2026-11-26');
  r := r || jsonb_build_object('6_two_misses', jsonb_build_object('today', game_day_result('2026-11-26'), 'weather', game_weather()));

  -- 7. timer stop logs hours worked
  insert into startup_sessions (project, start_at) values ('Personal agent', now() - interval '90 minutes') returning id into v_sid;
  x := stop_startup_session();
  r := r || jsonb_build_object('7_stop_90min', jsonb_build_object('minutes', x->'minutes', 'xp', x->'game'->'xp'));

  -- 8. finalize + full state shape
  x := finalize_startup_day(null);
  r := r || jsonb_build_object('8_finalize', x - 'avg_day');
  x := get_game_state();
  r := r || jsonb_build_object('8_state', jsonb_build_object('title', x->'title', 'level', x->'level', 'total', x->'total_xp',
     'today', x->'today', 'week', (select jsonb_agg((w->>'day') || ':' || coalesce(w->>'result','-') || ':' || coalesce(w->>'xp','')) from jsonb_array_elements(x->'week') w),
     'week_summary', x->'week_summary'));
  r := r || jsonb_build_object('8_form_startup_keys', (select jsonb_agg(k) from jsonb_object_keys(get_startup_today()) k));

  raise exception 'TEST_RESULT %', r::text;
end;
$$;
