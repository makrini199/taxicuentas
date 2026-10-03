# Estrategias y definiciones

## Swings (`structure/swings.py`)

Fractal de orden L/R sobre la barra `i`:

- **swing high** ⇔ `high[i] > max(high[i-L … i-1])` **y** `high[i] ≥ max(high[i+1 … i+R])`
- **swing low** ⇔ espejo con mínimos.

Asimetría estricta/no estricta ⇒ entre máximos iguales, el **primero** es el pivote (determinista).
Un pivote en `i` **sólo se conoce al cierre de `i+R`** (`confirm_idx`). Una barra puede ser swing high y swing
low a la vez (outside bar). No se fuerza la alternancia.

**Etiquetas** (en orden de confirmación): high → `HH` / `LH` / `EH` (igual dentro de `equal_tolerance`);
low → `HL` / `LL` / `EL`; el primero de cada tipo es `H` / `L`.

## BOS / CHOCH (`structure/events.py`)

Máquina de estados secuencial. En cada barra `t`: (1) se registran los swings con `confirm_idx = t`, (2) se
comprueban rupturas.

- `active_high` = último swing high confirmado aún no roto (análogo `active_low`).
- Ruptura alcista: `close[t] > active_high` (`break_mode: close`) o `high[t] > active_high` (`wick`).
- **BOS** = ruptura a favor de la tendencia vigente (o la primera, que la establece).
  **CHOCH** = ruptura contra la tendencia vigente (la tendencia cambia).
- Cada nivel se rompe **una sola vez**; los eventos emitidos nunca se reescriben.
- `protective_price` = último swing opuesto confirmado en ese instante (invalidación estructural).

## Baseline `structure_breakout_baseline` (EXP000)

Entrar en la dirección de cada BOS/CHOCH confirmado; stop tras el swing protector ± `stop_buffer`; objetivo
`rr`·R; salida por tiempo `max_bars_in_trade`; descartar stops fuera de `[min_stop, max_stop]`.
**No es una hipótesis de investigación**, sólo valida el pipeline. Parámetros en `config/strategy.yaml`.

## Próximos pasos: EXP001 (§49) y ablación (§50)

Hipótesis EXP001: *ruptura estructural confirmada + evento de liquidez + confirmación de volumen dentro de
una ventana de alta actividad*. Plan, de menos a más:

1. `BASE` = baseline actual en el TF de entrada elegido.
2. `BASE + SESSION` (golden hours Madrid vs. NY-anchored vs. resto).
3. `BASE + LIQUIDITY` (sweep previo de equal highs/lows o máximo/mínimo de sesión) — requiere fase 4.
4. `BASE + VOLUME` (volumen relativo; N a investigar) — requiere fase 6.
5. Combinación, sólo con los componentes que hayan aportado en validación.

Cada paso es un experimento nuevo en el registro; las reglas no se cambian sobre un experimento existente.
