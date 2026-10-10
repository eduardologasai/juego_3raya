-- =========================================================
-- ESQUEMA EXACTO DE BASE DE DATOS DEL CURSO (SUPABASE)
-- Copia y ejecuta este script en el SQL Editor de tu Supabase
-- =========================================================

-- Limpiar tablas previas para dejar el esquema limpio
drop table if exists public.game_moves cascade;
drop table if exists public.games cascade;
drop table if exists public.user_stats cascade;
drop table if exists public.match_moves cascade;
drop table if exists public.matches cascade;
drop table if exists public.players cascade;

-- 1. Tabla: players (Jugadores y estadísticas para el Ranking)
create table public.players (
  id uuid default gen_random_uuid() primary key,
  nickname text unique not null,
  games_played int4 not null default 0,
  wins int4 not null default 0,
  losses int4 not null default 0,
  ties int4 not null default 0,
  created_at timestamptz not null default now(),
  last_played_at timestamptz not null default now()
);

-- 2. Tabla: matches (Partidas jugadas para el Historial)
create table public.matches (
  id uuid default gen_random_uuid() primary key,
  game_mode text not null,
  player_x_name text not null,
  player_o_name text not null,
  winner text not null,
  total_moves int4 not null default 0,
  duration_seconds int4 not null default 0,
  final_board jsonb not null,
  created_at timestamptz not null default now()
);

-- 3. Tabla: match_moves (Movimientos individuales de cada partida)
create table public.match_moves (
  id int8 generated always as identity primary key,
  match_id uuid references public.matches(id) on delete cascade not null,
  move_number int4 not null,
  player bpchar(1) not null,
  cell_index int4 not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- POLÍTICAS DE ACCESO (Row Level Security - RLS)
-- Permite que la aplicación web lea y guarde datos con la anon key
-- =========================================================

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_moves enable row level security;

-- Políticas para players
create policy "Lectura pública de players"
  on public.players for select
  to anon, authenticated
  using (true);

create policy "Insert o update de players"
  on public.players for all
  to anon, authenticated
  using (true)
  with check (true);

-- Políticas para matches
create policy "Lectura pública de matches"
  on public.matches for select
  to anon, authenticated
  using (true);

create policy "Inserción de matches"
  on public.matches for insert
  to anon, authenticated
  with check (true);

-- Políticas para match_moves
create policy "Lectura pública de match_moves"
  on public.match_moves for select
  to anon, authenticated
  using (true);

create policy "Inserción de match_moves"
  on public.match_moves for insert
  to anon, authenticated
  with check (true);

-- Función RPC para registrar partida y actualizar jugador automáticamente
create or replace function record_match_and_player(
  p_game_mode text,
  p_player_x_name text,
  p_player_o_name text,
  p_winner text,
  p_total_moves int4,
  p_duration_seconds int4,
  p_final_board jsonb,
  p_moves jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_match_id uuid;
  v_move jsonb;
  v_is_win boolean;
  v_is_loss boolean;
  v_is_tie boolean;
begin
  -- 1. Insertar la partida
  insert into public.matches (
    game_mode, player_x_name, player_o_name, winner, total_moves, duration_seconds, final_board
  ) values (
    p_game_mode, p_player_x_name, p_player_o_name, p_winner, p_total_moves, p_duration_seconds, p_final_board
  ) returning id into v_match_id;

  -- 2. Insertar movimientos jugada por jugada
  if p_moves is not null and jsonb_array_length(p_moves) > 0 then
    for v_move in select * from jsonb_array_elements(p_moves) loop
      insert into public.match_moves (match_id, move_number, player, cell_index)
      values (
        v_match_id,
        (v_move->>'move_number')::int4,
        (v_move->>'player')::bpchar,
        (v_move->>'cell_index')::int4
      );
    end loop;
  end if;

  -- 3. Actualizar o insertar estadísticas del jugador X
  v_is_win := (p_winner = 'X');
  v_is_loss := (p_winner = 'O');
  v_is_tie := (p_winner = 'tie');

  insert into public.players (nickname, games_played, wins, losses, ties, last_played_at)
  values (
    p_player_x_name,
    1,
    case when v_is_win then 1 else 0 end,
    case when v_is_loss then 1 else 0 end,
    case when v_is_tie then 1 else 0 end,
    now()
  )
  on conflict (nickname) do update
  set
    games_played = public.players.games_played + 1,
    wins = public.players.wins + (case when v_is_win then 1 else 0 end),
    losses = public.players.losses + (case when v_is_loss then 1 else 0 end),
    ties = public.players.ties + (case when v_is_tie then 1 else 0 end),
    last_played_at = now();

  return v_match_id;
end;
$$;
