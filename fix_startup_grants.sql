grant all on startup_projects, startup_sessions, startup_todos, startup_proof, startup_daily_results, startup_state
  to service_role, anon, authenticated;
grant usage, select on all sequences in schema public to service_role, anon, authenticated;
