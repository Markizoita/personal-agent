create or replace function set_learned_total(p_item_id bigint, p_total text)
returns jsonb language plpgsql as $$
declare v_total numeric := nullif(nullif(trim(p_total), ''), 'null')::numeric;
begin
  update learned_items set total = v_total, updated_at = now() where id = p_item_id;
  return (select jsonb_build_object('id', id, 'title', title, 'type', type, 'total', total, 'current', current) from learned_items where id = p_item_id);
end;
$$;
