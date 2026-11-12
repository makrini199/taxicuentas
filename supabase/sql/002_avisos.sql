-- Avisos al móvil de los días fuertes.
-- De cada móvil apuntado solo se guarda a dónde mandarle el aviso y si quiere
-- todos los días o solo los más fuertes. Solo las toca la función «avisos».
create table if not exists public.avisos_suscripciones (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  nivel text not null default 'todos' check (nivel in ('todos', 'gordos')),
  creado timestamptz not null default now(),
  ultima_prueba timestamptz
);
alter table public.avisos_suscripciones enable row level security;  -- sin políticas: nadie de fuera la lee

-- Un aviso por día: la fecha es la del día del que se avisa.
create table if not exists public.avisos_envios (
  fecha date primary key,
  cosas int,
  ok int, muertas int, fallos int,
  enviado timestamptz not null default now()
);
alter table public.avisos_envios enable row level security;

-- Da el turno para un aviso de prueba: solo a quien está apuntado y como mucho
-- uno por minuto. Devuelve la suscripción, o nada.
create or replace function public.avisos_turno_prueba(destino text)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql security definer set search_path = public as $$
  update avisos_suscripciones s set ultima_prueba = now()
   where s.endpoint = destino and (s.ultima_prueba is null or s.ultima_prueba < now() - interval '1 minute')
  returning s.id, s.endpoint, s.p256dh, s.auth;
$$;
revoke all on function public.avisos_turno_prueba(text) from public, anon, authenticated;

-- La tarea programada (cada hora en punto; la función solo manda a las 20:00 de
-- Madrid). Se crea a mano una vez, con el secreto de verdad en lugar de <CRON_SECRET>:
--
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select cron.schedule('avisos-dias-fuertes', '0 * * * *', $job$
--     select net.http_post(
--       url := 'https://vkeslzurpaxiwgktlquf.supabase.co/functions/v1/avisos',
--       headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<CRON_SECRET>'),
--       body := jsonb_build_object('accion', 'enviar'));
--   $job$);
