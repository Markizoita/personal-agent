-- Start Up Ops is the to-do list (it replaced the Systems Plan doc on 2026-11-27). A to-do's tag can be
-- 'now', 'next' or 'later'; the Projects tab shows it and sorts by it. Safe to re-run; apply after homepage_sql.sql.
begin;

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
      'todos', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'day', day, 'tag', tag)
                         order by day nulls last, array_position(array['now','next','later'], tag) nulls last, id)
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

commit;
