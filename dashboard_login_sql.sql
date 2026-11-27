-- Dashboard login + session-gated action wrappers. The actual password
-- value is set separately (see set_dashboard_password.js), never in this
-- file or any committed SQL. Safe to re-run.
create extension if not exists pgcrypto;

create table if not exists dashboard_settings (
  key text primary key,
  value text
);

create table if not exists dashboard_sessions (
  token text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

grant all on table public.dashboard_settings, public.dashboard_sessions to service_role;

create or replace function dashboard_login(p_password text)
returns jsonb language plpgsql as $$
declare v_ok boolean;
declare v_token text;
begin
  select exists(select 1 from dashboard_settings where key = 'password' and value = p_password) into v_ok;
  if not v_ok then
    return jsonb_build_object('ok', false, 'reason', 'wrong password');
  end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into dashboard_sessions (token, expires_at) values (v_token, now() + interval '30 days');
  return jsonb_build_object('ok', true, 'token', v_token);
end;
$$;

create or replace function dashboard_session_valid(p_token text)
returns boolean language sql stable as $$
  select exists(select 1 from dashboard_sessions where token = p_token and expires_at > now())
$$;

-- ---------- session-gated wrappers around the already-proven action functions ----------

create or replace function dashboard_start(p_token text, p_project text default null)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return start_startup_session(p_project);
end;
$$;

create or replace function dashboard_stop(p_token text)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return stop_startup_session();
end;
$$;

-- The explicit "Submit/Finish today" action - separate from Stop, locks in the day.
create or replace function dashboard_submit_day(p_token text, p_off_reason text default null)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return finalize_startup_day(p_off_reason);
end;
$$;

create or replace function dashboard_add_todo(p_token text, p_project text, p_text text, p_day text default 'today', p_tag text default 'new')
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return add_startup_todo(p_project, p_text, p_day, p_tag);
end;
$$;

create or replace function dashboard_todo_done(p_token text, p_id text, p_done text default 'true')
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return set_startup_todo_done(p_id, p_done);
end;
$$;

create or replace function dashboard_todo_delete(p_token text, p_id text)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return delete_startup_todo(p_id);
end;
$$;

create or replace function dashboard_log_proof(p_token text, p_text text, p_project text default null)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return log_startup_proof(p_text, p_project);
end;
$$;

create or replace function dashboard_log_task(p_token text, p_task text, p_quantity text default null, p_note text default null, p_project text default null)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return log_game_task(p_task, p_quantity, p_note, 'dashboard', p_project);
end;
$$;

create or replace function dashboard_undo_task(p_token text, p_id text)
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return undo_game_task(p_id);
end;
$$;

create or replace function dashboard_set_project(p_token text, p_name text, p_status text default 'Building')
returns jsonb language plpgsql as $$
begin
  if not dashboard_session_valid(p_token) then return jsonb_build_object('ok', false, 'reason', 'invalid session'); end if;
  return set_startup_project(p_name, p_status);
end;
$$;

grant execute on all functions in schema public to service_role;
