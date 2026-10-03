# xauusd-quant

Sistema de **investigación cuantitativa** sobre XAUUSD. Su objetivo no es producir un backtest bonito, sino
decidir de forma reproducible si existe una ventaja explotable, e intentar destruir cada hipótesis antes de
aceptarla. Especificación completa: [`MASTER_PROMPT.md`](MASTER_PROMPT.md).

> **Estado: FIRST MILESTONE (§48) completado.** Esqueleto, pipeline de datos, motor de backtest, estructura de
> mercado básica, tests y un primer backtest (EXP000) sobre datos **sintéticos**. Aún **no hay datos reales**:
> ningún resultado de este repositorio dice nada todavía sobre el oro real.
> Nada aquí envía órdenes a ningún broker.

## Inicio rápido

```bash
cd xauusd-quant
pip install -r requirements.txt

python scripts/make_synthetic_data.py      # o coloca tu export de MT5 en data/raw y edita config/data.yaml
python scripts/build_dataset.py            # limpia, valida, remuestrea M1..D1, escribe metadata
python -m pytest                           # 62 tests
python scripts/run_backtest.py --name "mi experimento" --segment train
```

Cada ejecución crea `experiments/EXPnnn_<nombre>/` con `report.md`, `trades.csv`, `results.json`,
`config.yaml`, `meta.json` (commit git, hash del dataset) y `charts/`, y la añade a `experiments/registry.jsonl`.

### Usar datos reales de MetaTrader 5

1. MT5 → Ver → Símbolos → Barras → XAUUSD, M1 → Exportar barras → `data/raw/XAUUSD_M1.csv`
2. En `config/data.yaml`: `source: mt5_csv`, `raw_path: data/raw/XAUUSD_M1.csv` y **la zona horaria del
   servidor** en `source_timezone` (p. ej. `NY+7` para servidores "New York close", `Europe/Athens`, `UTC`…).
   Comprobarla bien: un error aquí desplaza todas las sesiones.
3. Ajustar `splits` a tus fechas y ejecutar `python scripts/build_dataset.py`.

## Estructura

```
config/        data.yaml · sessions.yaml · strategy.yaml · risk.yaml · backtest.yaml
src/xq/        paquete Python (ver ARCHITECTURE.md)
  data/        loaders (MT5, CSV, parquet), limpieza, gaps, metadata, remuestreo, sintético
  structure/   swings con retardo de confirmación, HH/HL/LH/LL, BOS/CHOCH
  mtf/         alineación HTF→LTF sin look-ahead
  strategies/  interfaz Strategy + baseline structure_breakout
  risk/        sizing y límites de cuenta
  execution/   modelo de costes (spread bid/ask, comisión, slippage, swap, latencia)
  backtesting/ motor barra a barra, métricas, desgloses, splits, runner
  reporting/   informe markdown, gráficos, criterios de aceptación, riesgo de overfitting
  optimization/ registro de experimentos + protección OOS
  wyckoff/ smc/ volume/ rsi/ robustness/  → fases futuras (vacíos a propósito)
tests/  scripts/  experiments/  reports/  notebooks/
```

El paquete se llama `xq` (en `src/xq/…`) en lugar de usar `src` como paquete: evita colisiones de nombres
(`data`, `features`…) con otras librerías. Los submódulos son los de §6.

## Documentación

| Documento | Contenido |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | módulos, flujo de datos, convenciones de tiempo |
| [DATA.md](DATA.md) | esquema, fuentes, zonas horarias, gaps, tick vs real volume |
| [BACKTESTING.md](BACKTESTING.md) | reglas de ejecución, costes, **cómo se evita cada tipo de look-ahead**, OOS |
| [STRATEGY.md](STRATEGY.md) | definiciones exactas de swing/BOS/CHOCH, baseline, plan de EXP001 |
| [RISK.md](RISK.md) | sizing y límites |
| [EXPERIMENTS.md](EXPERIMENTS.md) | registro, reproducibilidad, resultados hasta la fecha |
| [DEPLOYMENT.md](DEPLOYMENT.md) | separación investigación/ejecución, `LIVE_TRADING=false` |

## Hoja de ruta (§47)

| Fase | Estado |
|---|---|
| 1 Data infrastructure | ✅ |
| 2 Backtesting engine | ✅ (costes, riesgo básico, métricas, informes) |
| 3 Market structure | ✅ básica (swings, BOS/CHOCH) |
| 4 SMC (liquidez, sweeps, OB, FVG) | ⏭ siguiente |
| 5–7 Wyckoff · Volume · RSI | pendiente |
| 8–9 System A · System B | pendiente (EXP001 tras fase 4–6) |
| 10 Risk engine completo | parcial (sizing + límites ya existen) |
| 11–14 Robustez · Walk-forward · OOS · Monte Carlo | pendiente (OOS ya protegido) |
| 15–18 Research loop · Pine · MT5 paper · live | pendiente |
