create or replace function delete_learned_item(p_item_id bigint)
returns jsonb
language plpgsql
as $$
declare
  v_title text;
begin
  select title into v_title from learned_items where id = p_item_id;
  delete from learned_items where id = p_item_id;
  return jsonb_build_object('ok', true, 'title', v_title);
end;
$$;

grant execute on function delete_learned_item to service_role;
