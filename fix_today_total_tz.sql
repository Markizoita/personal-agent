create or replace function get_today_total()
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount), 0)
  from spending
  where created_at >= (now() at time zone 'America/New_York')::date::timestamp at time zone 'America/New_York'
    and created_at < ((now() at time zone 'America/New_York')::date::timestamp at time zone 'America/New_York') + interval '1 day';
$$;

grant execute on function get_today_total to service_role;
