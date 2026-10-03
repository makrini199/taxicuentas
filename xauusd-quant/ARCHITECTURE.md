# Arquitectura

## Flujo

```
config/*.yaml ──► xq.config (pydantic, extra="forbid": una clave mal escrita es un error, no un default silencioso)

data/raw ─► data.loaders ─► data.cleaning ─► data.schema.validate ─► data.resample ─► data/processed/*.parquet
                                     └─► data.metadata ─► data/metadata/*.json

processed TF ─► backtesting.splits (train / validation / oos)
            ─► strategies.<X>.generate_signals(df)       [usa structure/, mtf/, (smc, wyckoff… en el futuro)]
            ─► backtesting.engine.run_backtest            [risk.sizing, risk.limits, execution.costs]
            ─► backtesting.metrics / breakdown
            ─► reporting.acceptance / report / charts
            ─► optimization.registry  ─► experiments/EXPnnn_*/
```

## Principios de diseño

- **Señal y ejecución separadas.** Una estrategia sólo ve barras y devuelve señales (`bar_idx`, dirección,
  stop, R objetivo…). No ve equity, posiciones ni fills. Así su ausencia de look-ahead se puede testear
  aislada (tests de truncado y de futuro perturbado).
- **El motor es un bucle explícito barra a barra.** Más lento que un motor vectorizado, pero cada regla de fill
  es legible y testeable; con ~290k barras M5 tarda < 1 s.
- **Todo número ajustable vive en YAML.** El código sólo tiene defaults de esquema.
- **Nada se oculta.** Señales rechazadas (por riesgo, por stop inválido, por orden pendiente…) se guardan con
  su motivo; criterios no ejecutados aparecen como `NOT RUN`.

## Convenciones de tiempo

- Todos los timestamps internos son **UTC tz-aware**.
- El timestamp de una barra es su **apertura**. Su información está disponible en su **cierre**
  (`open + timeframe`, o la columna `close_time` en barras remuestreadas).
- Las decisiones se toman **al cierre** de una barra y se ejecutan **en la apertura de una barra posterior**.
- Sesiones e informes horarios se calculan convirtiendo a la zona de cada mercado (DST correcto).

## Módulos futuros

`smc/`, `wyckoff/`, `volume/`, `rsi/` producirán *features* y *eventos* con el mismo contrato que
`structure/`: cada evento lleva el índice de la barra en la que **se conoce** (no en la que "empezó"), y debe
pasar los tests de truncado. `robustness/` contendrá walk-forward, sensibilidad y Monte Carlo.
