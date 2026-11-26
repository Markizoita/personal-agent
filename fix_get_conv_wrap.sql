create or replace function get_recent_conversation(p_chat_id bigint, p_limit int default 20)
returns jsonb
language sql
as $$
  select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object('role', role, 'content', content) order by created_at), '[]'::jsonb))
  from (select * from conversation_messages where chat_id = p_chat_id order by created_at desc limit p_limit) s;
$$;

grant execute on function get_recent_conversation to service_role;
