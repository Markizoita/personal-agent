-- Automatic points: on each submit Claude says which actions happened; the database decides what counts and
-- how much XP it is worth. Safe to re-run. Apply after addon_sql.sql.
begin;

alter table game_tasks add column if not exists rule text;      -- what earns it, shown in the app and given to Claude
alter table game_tasks add column if not exists auto_from text; -- null = not picked by Claude; 'own' = Mark's entries; 'own+notes' = also Claude Code notes
alter table game_tasks add column if not exists daily_cap int;  -- most per project per day when added automatically

update game_tasks t set rule = r.rule, auto_from = r.auto_from, daily_cap = r.daily_cap
from (values
  ('hour_worked', 'Added by the timer when it stops.', null, null::int),
  ('win_day', 'Added once on any day that has proof.', null, null),
  ('shipped', 'Something new that people can now use went live or was delivered: a feature, page, automation or file. Fixes, small tweaks and saved code do not count. At most 1 per project per day.', 'own+notes', 1),
  ('milestone', 'A whole phase or major goal of a project was completed, such as a finished first version. A single feature or to-do does not count. At most 1 per project per day.', 'own+notes', 1),
  ('pitched', 'You pitched your product or service to a specific person or business.', 'own', null),
  ('follow_up', 'You sent a follow-up to someone you had already contacted.', 'own', null),
  ('meeting', 'A meeting got booked, or a prospect replied with interest.', 'own', null),
  ('demo', 'You showed the product working to a specific person, live or on a call. Only sending a link does not count.', 'own', null),
  ('money', 'Money you actually received, with the dollar amount written in your entry. Quotes and unpaid invoices do not count.', 'own', null)
) r(key, rule, auto_from, daily_cap)
where t.key = r.key;

alter table game_task_log add column if not exists ref text;    -- the entry an automatic point came from
create unique index if not exists game_task_log_ref on game_task_log (task_key, ref) where ref is not null;

-- Entries already looked at for points (a changed entry gets a new hash and is looked at again).
create table if not exists startup_scored (
  ref text not null,
  hash text not null,
  log_date date not null,
  scored_at timestamptz not null default now(),
  primary key (ref, hash)
);
alter table startup_scored enable row level security;
-- Set when an entry is parked rather than checked (its kind, project and text, kept for scoring later).
alter table startup_scored add column if not exists held jsonb;

create or replace function startup_name_key(p text) returns text language sql immutable as $$
  select lower(regexp_replace(coalesce(p, ''), '[^a-zA-Z0-9]', '', 'g'))
$$;

-- Everything on a day that points could come from.
create or replace function startup_point_items(p_day date)
returns table(ref text, kind text, project text, body text) language sql stable as $$
  select 'todo:' || t.id, 'todo', t.project,
         t.text || coalesce(' | proof: ' || (select string_agg(replace(p.text, t.text || ' — proof: ', ''), '; ' order by p.id)
                                             from startup_proof p where p.todo_id = t.id and p.log_date = p_day), '')
  from startup_todos t where t.done and t.day = p_day
  union all
  select 'proof:' || p.id, 'proof', p.project, p.text
  from startup_proof p where p.log_date = p_day
    and not exists(select 1 from startup_todos t where t.id = p.todo_id and t.done and t.day = p_day)
    -- outside work Mark already gave a type was logged on the spot
    and not exists(select 1 from game_task_log g where g.log_date = p_day and g.source = 'submit' and g.note = left(p.text, 200))
  union all
  select 'note:' || md5(c.session_id || l), 'note', c.project, substr(l, 3)
  from claude_sessions c cross join lateral regexp_split_to_table(c.summary, E'\n') l
  where c.day = p_day and l like '- %'
$$;

create or replace function startup_points_context(p_day date) returns jsonb language sql stable as $$
  select jsonb_build_object(
    'rules', (select jsonb_agg(jsonb_build_object('task', key, 'name', name, 'xp', xp, 'unit', unit, 'rule', rule,
                'allowed_entry_kinds', case when auto_from = 'own' then '["todo","proof"]'::jsonb else '["todo","proof","note"]'::jsonb end) order by sort)
              from game_tasks where active and auto_from is not null),
    'to_check', coalesce((select jsonb_agg(jsonb_build_object('ref', i.ref, 'kind', i.kind, 'project', i.project, 'text', i.body, 'hash', md5(i.body))
                  order by array_position(array['todo','proof','note'], i.kind), i.ref)
                from startup_point_items(p_day) i
                where not exists(select 1 from startup_scored s where s.ref = i.ref and s.hash = md5(i.body))), '[]'::jsonb),
    'already_counted', coalesce((select jsonb_agg(jsonb_build_object('task', task_key, 'date', log_date, 'project', project, 'what', note,
                  'removed_by_mark', undone_at is not null) order by log_date, id)
                from game_task_log where log_date between p_day - 7 and p_day and task_key not in ('hour_worked', 'win_day')), '[]'::jsonb)
  )
$$;

-- Applies Claude's picks. Anything that breaks a rule is skipped (with the reason); XP always comes from game_tasks.
create or replace function startup_apply_points(p_day date, p_actions jsonb, p_checked jsonb) returns jsonb
language plpgsql as $$
declare v_a jsonb;
declare v_task game_tasks;
declare v_item record;
declare v_qty numeric;
declare v_amount text;
declare v_plain text;
declare v_project text;
declare v_what text;
declare v_skip text;
declare v_id bigint;
declare v_added jsonb := '[]';
declare v_skipped jsonb := '[]';
declare v_before int := game_level(game_total_xp());
begin
  for v_a in select * from jsonb_array_elements(case when jsonb_typeof(p_actions) = 'array' then p_actions else '[]'::jsonb end) loop
    v_skip := null;
    select * into v_task from game_tasks where key = v_a->>'task' and active and auto_from is not null;
    select i.* into v_item from startup_point_items(p_day) i
     where i.ref = v_a->>'ref'
       and exists(select 1 from jsonb_array_elements(p_checked) k where k->>'ref' = i.ref and k->>'hash' = md5(i.body))
       and not exists(select 1 from startup_scored s where s.ref = i.ref and s.hash = md5(i.body));
    if v_task.key is null then v_skip := 'not an automatic action';
    elsif v_item.ref is null then v_skip := 'no new entry behind it';
    elsif v_item.kind = 'note' and v_task.auto_from = 'own' then v_skip := 'needs your own entry';
    end if;

    if v_skip is null then
      v_qty := case when jsonb_typeof(v_a->'quantity') = 'number' then (v_a->>'quantity')::numeric else 1 end;
      v_plain := replace(v_item.body, ',', '');
      -- the number as a pattern: 150, 150.00; 99.5, 99.50
      v_amount := case when v_qty = trunc(v_qty) then trunc(v_qty)::text || '(\.00?)?'
                  else replace(regexp_replace(to_char(round(v_qty, 2), 'FM999999999990.00'), '0$', ''), '.', '\.') || '0?' end;
      if v_task.key = 'money' then
        if v_qty <= 0 or not (v_plain ~* ('\$\s?' || v_amount || '(?![0-9]|\.[0-9])')
                              or v_plain ~* ('(?<![0-9.])' || v_amount || '\s?(dollars|usd|bucks)')) then
          v_skip := 'dollar amount not written in the entry';
        end if;
      elsif v_qty <> 1 then
        -- more than one only when that number is written in the entry
        if v_qty <> trunc(v_qty) or v_qty < 2 or v_qty > 20
           or v_plain !~ ('(?<![0-9.:])' || trunc(v_qty)::text || '(?![0-9:]|\.[0-9])') then v_qty := 1; end if;
      end if;
    end if;

    if v_skip is null then
      select name into v_project from startup_projects where startup_name_key(name) = startup_name_key(v_item.project) limit 1;
      v_project := coalesce(v_project, v_item.project);
      if v_task.daily_cap is not null and (select count(*) from game_task_log g where g.undone_at is null and g.task_key = v_task.key
            and g.log_date = p_day and startup_name_key(g.project) = startup_name_key(v_project)) >= v_task.daily_cap then
        v_skip := 'already counted for this project today';
      end if;
    end if;

    if v_skip is null then
      v_what := left(coalesce(nullif(trim(v_a->>'what'), ''), v_item.body), 200);
      v_id := null;
      insert into game_task_log (log_date, task_key, task_name, power, quantity, xp, source, note, project, ref)
      values (p_day, v_task.key, v_task.name, v_task.power, v_qty, round(v_task.xp * v_qty, 2), 'auto', v_what, v_project, v_item.ref)
      on conflict (task_key, ref) where ref is not null do nothing
      returning id into v_id;
      if v_id is null then v_skip := 'already counted';
      else v_added := v_added || jsonb_build_object('id', v_id, 'task', v_task.name, 'quantity', v_qty,
             'xp', round(v_task.xp * v_qty, 2), 'what', v_what, 'project', v_project);
      end if;
    end if;

    if v_skip is not null then
      v_skipped := v_skipped || jsonb_build_object('task', v_a->>'task', 'ref', v_a->>'ref', 'reason', v_skip);
    end if;
  end loop;

  insert into startup_scored (ref, hash, log_date)
  select k->>'ref', k->>'hash', p_day from jsonb_array_elements(case when jsonb_typeof(p_checked) = 'array' then p_checked else '[]'::jsonb end) k
  where k->>'ref' is not null and k->>'hash' is not null
  on conflict do nothing;

  update startup_daily_results set xp = round(game_day_xp(p_day)), level = game_level(game_total_xp()) where log_date = p_day;

  return jsonb_build_object('added', v_added, 'skipped', v_skipped, 'day_xp', game_day_xp(p_day),
    'total_xp', game_total_xp(), 'level', game_level(game_total_xp()), 'level_up', game_level(game_total_xp()) > v_before);
end;
$$;

-- Submit now also hands back what to check for points.
create or replace function dashboard_submit(p_token text, p_date text default null, p_outside jsonb default '[]'::jsonb)
returns jsonb language plpgsql as $$
declare v_res jsonb;
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  v_res := startup_submit_day(p_date, p_outside);
  return v_res || jsonb_build_object('points', startup_points_context((v_res->>'date')::date));
end;
$$;

-- Saves the breakdown and the points together. With no text (Claude failed) nothing is scored, so a retry redoes both.
create or replace function dashboard_finish_submit(p_token text, p_date text, p_text text, p_actions jsonb default '[]'::jsonb, p_checked jsonb default '[]'::jsonb)
returns jsonb language plpgsql as $$
declare v_res jsonb;
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  v_res := save_startup_breakdown(p_date, p_text);
  if (v_res->>'ok')::boolean and nullif(trim(coalesce(p_text, '')), '') is not null then
    v_res := v_res || jsonb_build_object('points', startup_apply_points(p_date::date, p_actions, p_checked));
  end if;
  return v_res;
end;
$$;

-- The points log and the rules behind it.
create or replace function get_dashboard_points() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total_xp', game_total_xp(), 'level', game_level(game_total_xp()),
    'xp_to_next', game_level(game_total_xp()) * 100 - game_total_xp(),
    'rules', (select jsonb_agg(jsonb_build_object('key', key, 'name', name, 'xp', xp, 'unit', unit, 'rule', rule,
                'how', case when auto_from is null then 'automatic' else 'from your submit' end) order by sort)
              from game_tasks where active),
    'entries', coalesce((select jsonb_agg(e order by e->>'date' desc, (e->>'id')::bigint desc) from (
        select jsonb_build_object('id', id, 'date', log_date, 'label', to_char(log_date, 'Dy Mon FMDD'), 'task', task_name,
                 'quantity', quantity, 'xp', xp, 'source', source, 'note', note, 'project', project,
                 'removed', undone_at is not null, 'can_remove', undone_at is null and task_key not in ('hour_worked', 'win_day')) e
        from game_task_log
        where undone_at is null or source = 'auto'
        order by log_date desc, id desc limit 300) x), '[]'::jsonb))
$$;

create or replace function dashboard_get_points(p_token text) returns jsonb language plpgsql stable as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true) || get_dashboard_points();
end;
$$;

-- Removing a point also corrects that day's record.
create or replace function undo_game_task(p_id text) returns jsonb language plpgsql as $$
declare v_id bigint := nullif(regexp_replace(coalesce(p_id, ''), '[^0-9]', '', 'g'), '')::bigint;
declare v_row game_task_log;
begin
  update game_task_log set undone_at = now() where id = v_id and undone_at is null returning * into v_row;
  if v_row.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not found or already undone');
  end if;
  update startup_daily_results set xp = round(game_day_xp(v_row.log_date)) where log_date = v_row.log_date;
  update startup_daily_results set level = game_level(game_total_xp())
   where log_date = (select max(log_date) from startup_daily_results);
  return jsonb_build_object('ok', true, 'id', v_row.id, 'task', v_row.task_name, 'xp_removed', v_row.xp,
    'total_xp', game_total_xp(), 'level', game_level(game_total_xp()), 'today_xp', game_day_xp(startup_today()));
end;
$$;

commit;
