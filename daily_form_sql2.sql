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

  return (select to_jsonb(d) from daily_log d where log_date = p_log_date);
end;
$$;

create or replace function log_purchase_v2(p_amount numeric, p_merchant text, p_category text, p_raw_message text default null)
returns jsonb
language plpgsql
as $$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_total numeric;
  v_items jsonb;
begin
  insert into spending (amount, merchant, category, raw_message, confirmed)
  values (p_amount, p_merchant, p_category, p_raw_message, true);

  v_day_start := (now() at time zone 'America/New_York')::date::timestamp at time zone 'America/New_York';
  v_day_end := v_day_start + interval '1 day';

  select coalesce(sum(amount), 0) into v_total from spending where created_at >= v_day_start and created_at < v_day_end;
  select coalesce(jsonb_agg(jsonb_build_object('merchant', merchant, 'amount', amount, 'category', category) order by created_at), '[]'::jsonb)
  into v_items from spending where created_at >= v_day_start and created_at < v_day_end;

  return jsonb_build_object('ok', true, 'today_total', v_total, 'today_items', v_items);
end;
$$;

create or replace function confirm_pending_purchase_v2(p_id bigint, p_merchant text, p_category text)
returns jsonb
language plpgsql
as $$
declare
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_total numeric;
  v_items jsonb;
begin
  update spending set merchant = p_merchant, category = p_category, confirmed = true where id = p_id;

  v_day_start := (now() at time zone 'America/New_York')::date::timestamp at time zone 'America/New_York';
  v_day_end := v_day_start + interval '1 day';

  select coalesce(sum(amount), 0) into v_total from spending where created_at >= v_day_start and created_at < v_day_end;
  select coalesce(jsonb_agg(jsonb_build_object('merchant', merchant, 'amount', amount, 'category', category) order by created_at), '[]'::jsonb)
  into v_items from spending where created_at >= v_day_start and created_at < v_day_end;

  return jsonb_build_object('ok', true, 'today_total', v_total, 'today_items', v_items);
end;
$$;

grant execute on function upsert_daily_log, log_purchase_v2, confirm_pending_purchase_v2 to service_role;
