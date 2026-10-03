# Experimentos

## Reproducibilidad

Cada ejecución de `scripts/run_backtest.py` crea `experiments/<ID>_<nombre>/`:

| fichero | contenido |
|---|---|
| `report.md` | informe completo (§37), con secciones no ejecutadas marcadas `NOT RUN` |
| `config.yaml` | **toda** la configuración resuelta |
| `meta.json` | id, fecha, commit git (+ si había cambios sin commitear), segmento, hashes del dataset, huella, uso de OOS, estado |
| `results.json` | métricas por escenario de costes, info del motor, criterios de aceptación, flags de overfitting |
| `trades.csv` | log de operaciones (§23) del escenario principal |
| `rejected_signals.csv` | señales no ejecutadas y por qué |
| `charts/` | equity/drawdown, equity por escenario, distribución R, heatmap mensual, MAE/MFE, hora, día |

Y una línea en `experiments/registry.jsonl`. Un experimento con la misma huella no se repite (salvo `--force`);
un uso repetido del OOS por la misma familia marca el experimento `INVALIDATED`.

## Estados

`REJECT` (falla un criterio duro) · `RESEARCH` (nada falla pero hay criterios `NOT RUN`) · `CANDIDATE`
(todo pasa → sólo paper trading) · `INVALIDATED` (OOS contaminado). Ninguna estrategia se declara
"production ready" automáticamente.

## Registro

| ID | fecha | datos | segmento | resultado | estado |
|---|---|---|---|---|---|
| EXP000 | 2026-10-03 | **sintéticos** (paseo aleatorio) | train 2021–2022 | baseline BOS/CHOCH M5: −0.13 / −0.24 / −0.44 R por operación (optimista / base / stress); kill switch del 20 % DD en los tres | **REJECT** (esperado) |

### EXP000 — conclusión

El pipeline funciona de extremo a extremo. Sobre datos sin ventaja, la estrategia pierde aproximadamente lo que
cuestan los costes, y la pérdida crece monótonamente con el escenario de costes, como debe ser. Validación del
motor fuera del registro (test de hipótesis nula): sin costes, sobre 10 paseos aleatorios independientes
(9 259 operaciones), la esperanza es **+0.007 R (t = 0.51)**: no hay sesgo ni fuga de información detectable.

Observación útil para la investigación real: con stops mínimos de 0.50 USD en M5, el spread+comisión+slippage
del escenario base consume ≈ 0.15–0.25 R por operación. **Cualquier estrategia M5 con stops estrechos necesita
una ventaja bruta mayor que eso solo para empatar.**
