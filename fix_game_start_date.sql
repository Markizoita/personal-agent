-- The old Input Log sheet's history (from 2026-11-13) was imported, so the game's streak, weather, weekly view and history start there too.
create or replace function game_start_date() returns date
language sql immutable as $$ select date '2026-11-13' $$;
