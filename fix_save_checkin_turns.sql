-- Save scheduled check-ins / pings (no user message) as assistant-only turns,
-- so a later reply like "z, nothing, dan nothing" has the questions in history.
-- Before this, any turn without p_user_text was skipped entirely.
create or replace function save_conversation_turn(p_chat_id bigint, p_user_text text, p_assistant_text text)
returns jsonb
language plpgsql
as $$
begin
  if p_chat_id is null or coalesce(btrim(p_assistant_text), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'skipped - nothing to save');
  end if;

  if p_user_text is not null then
    insert into conversation_messages (chat_id, role, content) values (p_chat_id, 'user', p_user_text);
  end if;
  insert into conversation_messages (chat_id, role, content) values (p_chat_id, 'assistant', p_assistant_text);
  return jsonb_build_object('ok', true, 'assistant_only', p_user_text is null);
end;
$$;

grant execute on function save_conversation_turn to service_role;

-- A user message and its reply share the same now() timestamp, so order by id
-- as a tiebreaker or the pair can show up reversed in the bot's history.
create or replace function get_recent_conversation(p_chat_id bigint, p_limit integer default 20)
returns jsonb
language sql
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object('role', role, 'content', content) order by created_at, id), '[]'::jsonb))
  from (select * from conversation_messages where chat_id = p_chat_id order by created_at desc, id desc limit p_limit) s;
$$;

grant execute on function get_recent_conversation to service_role;
