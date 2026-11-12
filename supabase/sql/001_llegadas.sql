-- Llegadas al aeropuerto: la última respuesta de AeroDataBox, guardada para
-- servirla a la app sin volver a preguntar en cada apertura.
-- Una sola fila (id = 1). Solo la toca la función «llegadas» del servidor.
create table if not exists public.llegadas_cache (
  id int primary key check (id = 1),
  activo boolean not null default true,          -- interruptor: false = la app no enseña el aeropuerto
  minutos int not null default 30,               -- cada cuánto se vuelve a preguntar, como mucho
  max_llamadas_mes int not null default 180,     -- tope de llamadas al mes (cada una gasta 2 unidades)
  mes text,                                      -- mes en curso, 'YYYY-MM' (hora de Madrid)
  llamadas_mes int not null default 0,
  actualizado timestamptz,
  datos jsonb,
  pidiendo_desde timestamptz,                    -- quién está preguntando ahora mismo
  unidades_restantes int,                        -- lo que dice AeroDataBox que queda de cuota
  ultimo_error text
);
alter table public.llegadas_cache enable row level security;  -- sin políticas: nadie de fuera la lee
insert into public.llegadas_cache (id) values (1) on conflict (id) do nothing;

-- Da el turno para preguntar a AeroDataBox, a una sola petición cada vez, y
-- solo si lo guardado está viejo y no se ha pasado el tope del mes.
create or replace function public.llegadas_reclamar() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ok boolean;
  m text := to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM');
begin
  update llegadas_cache set mes = m, llamadas_mes = 0 where id = 1 and mes is distinct from m;
  update llegadas_cache
     set pidiendo_desde = now(), llamadas_mes = llamadas_mes + 1
   where id = 1 and activo
     and (actualizado is null or actualizado < now() - make_interval(mins => minutos))
     and (pidiendo_desde is null or pidiendo_desde < now() - interval '5 minutes')  -- si falla, no se reintenta hasta pasados 5 minutos
     and llamadas_mes < max_llamadas_mes
  returning true into ok;
  return coalesce(ok, false);
end $$;
revoke all on function public.llegadas_reclamar() from public, anon, authenticated;
