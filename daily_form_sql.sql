drop table if exists daily_log;

create table daily_log (
  log_date date primary key,
  sleep_hours numeric,
  food jsonb not null default '[]'::jsonb,
  gym_done boolean,
  gym_note text,
  mood int,
  mood_note text,
  start_build_hours numeric,
  start_plan_hours numeric,
  start_proof text,
  updated_at timestamptz not null default now()
);

grant all on table public.daily_log to service_role;

create or replace function upsert_daily_log(
  p_log_date date,
  p_sleep_hours numeric default null,
  p_food_item text default null,
  p_gym_done boolean default null,
  p_gym_note text default null,
  p_mood int default null,
  p_mood_note text default null,
  p_start_build_hours numeric default null,
  p_start_plan_hours numeric default null,
  p_start_proof text default null
)
returns jsonb
language plpgsql
as $$
begin
  insert into daily_log (log_date) values (p_log_date)
  on conflict (log_date) do nothing;

  update daily_log set
    sleep_hours = coalesce(p_sleep_hours, sleep_hours),
    food = case when p_food_item is not null then food || to_jsonb(p_food_item) else food end,
    gym_done = coalesce(p_gym_done, gym_done),
    gym_note = coalesce(p_gym_note, gym_note),
    mood = coalesce(p_mood, mood),
    mood_note = coalesce(p_mood_note, mood_note),
    start_build_hours = coalesce(p_start_build_hours, start_build_hours),
    start_plan_hours = coalesce(p_start_plan_hours, start_plan_hours),
    start_proof = coalesce(p_start_proof, start_proof),
    updated_at = now()
  where log_date = p_log_date;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function get_daily_form(p_log_date date)
returns jsonb
language plpgsql
as $$
declare
  v_log daily_log%rowtype;
  v_wake jsonb;
  v_spending_total numeric;
  v_spending_items jsonb;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  v_day_start := p_log_date::timestamp at time zone 'America/New_York';
  v_day_end := v_day_start + interval '1 day';

  select * into v_log from daily_log where log_date = p_log_date;

  select jsonb_build_object('result', result, 'streak_current', streak_current, 'streak_best', streak_best)
  into v_wake from wake_proof where log_date = p_log_date;

  select coalesce(sum(amount), 0) into v_spending_total
  from spending where created_at >= v_day_start and created_at < v_day_end;

  select coalesce(jsonb_agg(jsonb_build_object('merchant', merchant, 'amount', amount, 'category', category) order by created_at), '[]'::jsonb)
  into v_spending_items
  from spending where created_at >= v_day_start and created_at < v_day_end;

  return jsonb_build_object(
    'log_date', p_log_date,
    'sleep_hours', v_log.sleep_hours,
    'food', coalesce(v_log.food, '[]'::jsonb),
    'gym_done', v_log.gym_done,
    'gym_note', v_log.gym_note,
    'mood', v_log.mood,
    'mood_note', v_log.mood_note,
    'start_build_hours', v_log.start_build_hours,
    'start_plan_hours', v_log.start_plan_hours,
    'start_proof', v_log.start_proof,
    'wake', coalesce(v_wake, 'null'::jsonb),
    'spending_total', v_spending_total,
    'spending_items', v_spending_items,
    'schedule_items', '[]'::jsonb,
    'tiktok_minutes', null
  );
end;
$$;

grant execute on function upsert_daily_log, get_daily_form to service_role;
