create or replace function save_conversation_turn(p_chat_id bigint, p_user_text text, p_assistant_text text)
returns jsonb
language plpgsql
as $$
begin
  if p_chat_id is null or p_user_text is null then
    return jsonb_build_object('ok', false, 'reason', 'skipped - not a real conversation turn');
  end if;

  insert into conversation_messages (chat_id, role, content) values (p_chat_id, 'user', p_user_text);
  insert into conversation_messages (chat_id, role, content) values (p_chat_id, 'assistant', p_assistant_text);
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function save_conversation_turn to service_role;
