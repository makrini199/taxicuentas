# Riesgo

## Sizing (`risk/sizing.py`)

```
riesgo_$  = balance × risk_per_trade_pct / 100
pérdida_por_lote = distancia_stop × contract_size  (+ comisión_por_lote si include_commission_in_sizing)
lotes = floor(riesgo_$ / pérdida_por_lote, lot_step), máx. max_lot
```
Si el resultado es menor que `min_lot`, la operación **se descarta** (`size_below_min_lot`) en lugar de
arriesgar de más. La distancia al stop se mide desde el **precio de fill real** (con spread y slippage).
1 lote = 100 oz (`contract_size`); el P&L está en USD.

## Límites de cuenta (`risk/limits.py`, `config/risk.yaml`)

| límite | efecto |
|---|---|
| `max_daily_loss_pct` | sin nuevas entradas el resto del día (`risk_day_timezone`) |
| `max_weekly_loss_pct` | sin nuevas entradas el resto de la semana ISO |
| `max_consecutive_losses` | sin nuevas entradas hasta el día siguiente (el contador se reinicia) |
| `max_drawdown_pct` | **kill switch**: sin nuevas entradas para el resto del backtest |
| `max_open_positions` | límite de posiciones simultáneas |

Las posiciones abiertas no se cierran al saltar un límite: siguen con su stop/objetivo. Cada señal bloqueada
queda en `rejected_signals.csv` con su motivo. Cuando el kill switch salta, el informe lo dice explícitamente,
porque la muestra queda truncada.

## Pendiente (fase 10)

Stops ATR/liquidez/híbridos, trailing, salidas parciales, filtros de spread y de volatilidad anómala, sizing
por volatilidad.
