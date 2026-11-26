drop function if exists upsert_daily_log(date, numeric, text, boolean, text, int, text, numeric, numeric, text);

create or replace function upsert_daily_log(
  p_log_date date,
  p_sleep_hours text default null,
  p_food_item text default null,
  p_gym_done text default null,
  p_gym_note text default null,
  p_mood text default null,
  p_mood_note text default null,
  p_start_build_hours text default null,
  p_start_plan_hours text default null,
  p_start_proof text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_sleep numeric;
  v_gym boolean;
  v_mood int;
  v_build numeric;
  v_plan numeric;
  v_food text;
  v_gym_note text;
  v_mood_note text;
  v_proof text;
begin
  v_sleep := nullif(nullif(trim(p_sleep_hours), ''), 'null')::numeric;
  v_build := nullif(nullif(trim(p_start_build_hours), ''), 'null')::numeric;
  v_plan := nullif(nullif(trim(p_start_plan_hours), ''), 'null')::numeric;
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
  v_proof := nullif(nullif(trim(p_start_proof), ''), 'null');

  insert into daily_log (log_date) values (p_log_date)
  on conflict (log_date) do nothing;

  update daily_log set
    sleep_hours = coalesce(v_sleep, sleep_hours),
    food = case when v_food is not null then food || to_jsonb(v_food) else food end,
    gym_done = coalesce(v_gym, gym_done),
    gym_note = coalesce(v_gym_note, gym_note),
    mood = coalesce(v_mood, mood),
    mood_note = coalesce(v_mood_note, mood_note),
    start_build_hours = coalesce(v_build, start_build_hours),
    start_plan_hours = coalesce(v_plan, start_plan_hours),
    start_proof = coalesce(v_proof, start_proof),
    updated_at = now()
  where log_date = p_log_date;

  return (select to_jsonb(d) from daily_log d where log_date = p_log_date);
end;
$$;

grant execute on function upsert_daily_log to service_role;
