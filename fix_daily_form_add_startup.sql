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
    'start_build_hours', v_log.start_build_hours,
    'start_plan_hours', v_log.start_plan_hours,
    'start_proof', v_log.start_proof,
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
