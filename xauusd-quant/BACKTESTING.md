# Backtesting

## Orden de operaciones en cada barra `i` (`backtesting/engine.py`)

1. Contabilidad de riesgo de nuevo día/semana (zona `risk_day_timezone`).
2. **Fill** de la orden pendiente en la **apertura** de `i` (la señal salió del cierre de `i-1-latency`).
3. Gestión de posiciones con el rango de `i`: stop, objetivo, salida por tiempo.
4. Valoración a mercado al **cierre** de `i`; kill-switch por drawdown.
5. Lectura de la señal generada al **cierre** de `i` → queda pendiente para `i+1+latency`.

Consecuencia: una señal nunca se ejecuta en la barra que la produce, y una posición sólo se evalúa con barras
iguales o posteriores a su entrada.

## Modelo de ejecución (`execution/costs.py`)

Precios del fichero = **bid** (MT5). `ask = bid + spread`.

| evento | dispara cuando | precio de fill |
|---|---|---|
| entrada larga (mercado) | apertura | `ask_open + slippage_market` |
| entrada corta (mercado) | apertura | `bid_open − slippage_market` |
| stop largo | `bid_low ≤ stop` | `stop − slippage_stop`; si abre por debajo (gap): `bid_open − slippage_stop` |
| stop corto | `ask_high ≥ stop` | `stop + slippage_stop`; gap: `ask_open + slippage_stop` |
| objetivo (límite) | `bid_high ≥ tp` / `ask_low ≤ tp` | `tp` (o la apertura si es mejor) |
| salida por tiempo / fin de datos | cierre | cierre ∓ `slippage_market` |

- **Ambigüedad intrabarra:** si stop y objetivo caen en la misma barra se asume **stop primero**.
- Comisión por lote ida y vuelta al cerrar; swap por lote y noche (rollover 17:00 NY; miércoles ×3).
- Latencia = barras extra entre señal y fill.
- El spread por barra viene de los datos (× `spread_multiplier`, con suelo `min_spread`) o es fijo.
- Escenarios `optimistic` / `base` / `stress` en `config/backtest.yaml`; **cada experimento ejecuta los tres**.

MAE/MFE se miden desde el fill (bid para largos, ask para cortos). En la barra de salida el orden intrabarra es
desconocido: MAE incluye la barra completa (sobreestimado) y MFE excluye el extremo de una barra de stop
(infraestimado). Ambos errores son conservadores.

## Cómo se evita cada forma de sesgo (§3)

| riesgo | medida | test |
|---|---|---|
| **look-ahead / future leak** | señales calculadas al cierre de la barra, fill en la apertura de una barra posterior | `test_engine::test_fill_uses_next_open_not_signal_close`, `test_latency_delays_fill` |
| **máximos/mínimos futuros sin confirmar** | un swing en `i` necesita `R` barras posteriores y sólo existe desde `confirm_idx = i+R` | `test_structure::test_swing_high_confirmed_only_after_right_bars`, `test_no_pivot_without_enough_right_bars` |
| **repainting** | eventos BOS/CHOCH inmutables, cada nivel se rompe una sola vez, estado secuencial | `test_no_lookahead::test_events_and_trend_truncation_invariant`, `test_each_level_breaks_once` |
| **uso de vela HTF no cerrada** | alineación MTF por `close_time` del HTF ≤ cierre de la barra LTF; barra HTF parcial nunca visible | `test_resample_mtf::test_htf_bar_invisible_until_closed`, `test_partial_trailing_htf_bar_never_visible`, `test_mtf_alignment_truncation_invariant` |
| **información futura en general** | invariancia al truncado y a la perturbación del futuro: alterar todo lo posterior a `k` no cambia ninguna señal anterior a `k` | `test_no_lookahead::test_signals_unchanged_when_future_is_scrambled` |
| **sesgo oculto del motor** | test de hipótesis nula: sobre 4 paseos aleatorios independientes la esperanza sin costes debe ser ≈ 0 (\|t\| < 3) | `test_null_hypothesis` |
| **selección retrospectiva de operaciones** | el motor ejecuta todas las señales; las descartadas quedan en `rejected_signals.csv` con motivo; sin filtros post-hoc | `test_engine::test_rejections` |
| **optimización con OOS** | ver abajo | `test_registry_runner::test_oos_requires_confirmation_and_second_use_is_invalidated` |
| **cambio silencioso de parámetros** | huella (fingerprint) de estrategia+parámetros+costes+riesgo+dataset; re-ejecutar idéntico se rechaza; config completa guardada en cada experimento | `test_end_to_end_experiment` |
| **zonas horarias / DST** | timestamps UTC tz-aware; ventanas evaluadas en su zona propia | `test_sessions_time` (incl. semana de desfase DST España/EE. UU.) |

## Splits y protección del OOS (§29)

`config/data.yaml → splits` define `train = [inicio, train_end)`, `validation = [train_end, validation_end)`,
`oos = [validation_end, fin]`.

- `run_backtest.py` usa `train` por defecto.
- `oos` o `full` exigen `--confirm-oos`; si no, error.
- Cada uso del OOS queda registrado (`oos_used: true`). **Si la misma familia de estrategia ya consumió el OOS,
  la nueva ejecución se marca `INVALIDATED`** (snooping).
- Cada segmento se corta *antes* de calcular señales: los primeros swings de un segmento se pierden por
  calentamiento, pero ningún dato de otro segmento entra.

## Métricas (§22)

`backtesting/metrics.py`: net/gross profit/loss, PF, win/loss rate, expectancy (dinero y R), t-stat y p-valor
de la media de R, media/mayor ganancia/pérdida, rachas, max/avg drawdown (% y dinero), Sharpe/Sortino (diarios
anualizados ×√252), CAGR, Calmar, recovery factor, trades/año. Rentabilidad mensual/anual y desgloses por
sesión, día, hora, dirección, setup, motivo de salida, año y régimen.

## Limitaciones conocidas

- Spread constante dentro de la barra; sin modelo de profundidad de mercado.
- Fill de stops con slippage fijo (no dependiente de volatilidad) — pendiente de investigar.
- Régimen de mercado aún no implementado (`market_regime = unclassified`).
- Walk-forward, sensibilidad y Monte Carlo: fases 11–14.
