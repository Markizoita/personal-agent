-- Session-gated read wrappers, same auth as the write actions (one token
-- for everything, set at login). Safe to re-run.
create or replace function dashboard_get_home(p_token text)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true) || get_dashboard_home();
end;
$$;

create or replace function dashboard_get_progress(p_token text, p_period text default 'week')
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true) || get_dashboard_progress(p_period);
end;
$$;

create or replace function dashboard_get_projects(p_token text)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true, 'projects', get_dashboard_projects());
end;
$$;

create or replace function dashboard_get_history(p_token text, p_days text default '30')
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true) || get_dashboard_history(p_days);
end;
$$;

create or replace function dashboard_get_day(p_token text, p_date text default null)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return jsonb_build_object('ok', true) || get_dashboard_day(p_date);
end;
$$;

grant execute on all functions in schema public to service_role;
