CREATE OR REPLACE FUNCTION public.get_daily_form(p_log_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_log daily_log%rowtype;
  v_wake jsonb;
  v_spending_total numeric;
  v_spending_items jsonb;
  v_schedule_items jsonb;
  v_notes_today jsonb;
  v_learned_today jsonb;
  v_tiktok jsonb;
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'start_time', start_time, 'end_time', end_time,
    'place', place, 'check_at', check_at, 'status', status, 'what_happened', what_happened
  ) order by start_time), '[]'::jsonb)
  into v_schedule_items
  from schedule_items where log_date = p_log_date;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'text', text, 'tags', tags) order by created_at), '[]'::jsonb)
  into v_notes_today
  from notes where created_at >= v_day_start and created_at < v_day_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id, 'title', i.title, 'type', i.type, 'total', i.total, 'current', i.current, 'delta_today', t.delta_today
  ) order by t.delta_today desc), '[]'::jsonb)
  into v_learned_today
  from (
    select item_id, sum(delta) as delta_today
    from learned_log
    where created_at >= v_day_start and created_at < v_day_end
    group by item_id
  ) t
  join learned_items i on i.id = t.item_id;

  v_tiktok := get_tiktok_minutes_for_date(p_log_date);

  return jsonb_build_object(
    'log_date', p_log_date,
    'sleep_hours', v_log.sleep_hours,
    'food', coalesce(v_log.food, '[]'::jsonb),
    'gym_done', v_log.gym_done,
    'gym_note', v_log.gym_note,
    'mood', v_log.mood,
    'mood_note', v_log.mood_note,
    'wake', coalesce(v_wake, 'null'::jsonb),
    'spending_total', v_spending_total,
    'spending_items', v_spending_items,
    'schedule_items', v_schedule_items,
    'notes_today', v_notes_today,
    'learned_today', v_learned_today,
    'tiktok_minutes', v_tiktok->'minutes',
    'startup', get_startup_today()
  );
end;
$function$;

-- Keep accepting the old params (so the existing n8n tool call never breaks),
-- just stop writing them anywhere - the columns are gone.
CREATE OR REPLACE FUNCTION public.upsert_daily_log(p_log_date date, p_sleep_hours text DEFAULT NULL::text, p_food_item text DEFAULT NULL::text, p_gym_done text DEFAULT NULL::text, p_gym_note text DEFAULT NULL::text, p_mood text DEFAULT NULL::text, p_mood_note text DEFAULT NULL::text, p_start_build_hours text DEFAULT NULL::text, p_start_plan_hours text DEFAULT NULL::text, p_start_proof text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_sleep numeric;
  v_gym boolean;
  v_mood int;
  v_food text;
  v_gym_note text;
  v_mood_note text;
begin
  v_sleep := nullif(nullif(trim(p_sleep_hours), ''), 'null')::numeric;
  v_mood := nullif(nullif(trim(p_mood), ''), 'null')::int;
  v_gym := case
    when nullif(nullif(trim(p_gym_done), ''), 'null') is null then null
    when lower(trim(p_gym_done)) in ('true', 'yes', '1') then true
    when lower(trim(p_gym_done)) in ('false', 'no', '0') then false
    else null
  end;
  v_food := nullif(nullif(trim(p_food_item), ''), 'null');
  v_gym_note := nullif(nullif(trim(p_gym_note), ''), 'null');
  v_mood_note := nullif(nullif(trim(p_mood_note), ''), 'null');

  insert into daily_log (log_date) values (p_log_date)
  on conflict (log_date) do nothing;

  update daily_log set
    sleep_hours = coalesce(v_sleep, sleep_hours),
    food = case when v_food is not null then food || to_jsonb(v_food) else food end,
    gym_done = coalesce(v_gym, gym_done),
    gym_note = coalesce(v_gym_note, gym_note),
    mood = coalesce(v_mood, mood),
    mood_note = coalesce(v_mood_note, mood_note),
    updated_at = now()
  where log_date = p_log_date;

  return (select to_jsonb(d) from daily_log d where log_date = p_log_date);
end;
$function$;

alter table daily_log drop column if exists start_build_hours;
alter table daily_log drop column if exists start_plan_hours;
alter table daily_log drop column if exists start_proof;
