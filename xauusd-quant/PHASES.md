# Fases y criterios de paso

Regla (indicación del usuario): **no se avanza a la siguiente fase hasta que la actual esté funcionando,
testeada y documentada.** Cada fase tiene una lista de criterios verificables; una fase se cierra sólo cuando
todos están en ✅.

> Nota de transparencia: el primer hito (§48) creó también código de las fases 2 (motor de backtest) y 3
> (estructura básica), con sus tests. Ese código **no se considera aceptado**: está congelado y se revisará
> contra sus propios criterios cuando llegue su fase. No se trabaja en él mientras la fase 1 esté abierta.

| Fase | Estado |
|---|---|
| 1 Data infrastructure | 🟡 **abierta**: todo ✅ excepto la validación con datos reales (1.10) |
| 2 Backtesting engine | ⏸ congelada (código existente, no aceptado) |
| 3 Market structure | ⏸ congelada (código existente, no aceptado) |
| 4–18 | no iniciadas |

## Fase 1 — Data infrastructure

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1.1 | Esquema canónico OHLCV(+spread) en UTC, validado | ✅ | `data/schema.py`; `test_data.py::test_validate_*` |
| 1.2 | Varias fuentes, sin acoplarse a un broker: MT5, CSV genérico (timestamp o fecha+hora, con o sin zona), parquet | ✅ | `data/loaders.py`; `test_data.py::test_mt5_*`, `test_data_phase1.py::test_generic_csv_*` |
| 1.3 | Varios ficheros (glob), orden determinista; duplicados idénticos vs. **conflictivos** contados por separado; prohibido mezclar tick y real volume | ✅ | `test_end_to_end_mt5_multi_file_build`, `test_duplicate_conflicts_counted_separately`, `test_mixing_tick_and_real_volume_files_is_refused` |
| 1.4 | Zonas horarias: UTC interno; horas ambiguas/inexistentes por DST descartadas y contadas; servidores `NY+7` | ✅ | `test_dst_ambiguous_local_times_are_dropped_and_counted`, `test_mt5_ny_plus_7_server_time` |
| 1.5 | **Diagnóstico de zona horaria** contra el cierre/reapertura semanal del oro; detecta desfase fijo, regla DST equivocada y calendario DST europeo vs. americano | ✅ | `test_timezone_*` (4 casos + datos insuficientes) |
| 1.6 | Limpieza sin reparar precios; huecos clasificados (fin de semana / pausa diaria / inesperado); cobertura vs. calendario nominal; lista de ticks sospechosos (sin borrar) | ✅ | `test_gap_classification`, `test_coverage_detects_missing_day`, `test_spike_detection_flags_bad_tick_without_removing` |
| 1.7 | Comprobaciones que bloquean el build: timeframe declarado ≠ real, unidades de spread imposibles, zona horaria incorrecta, cobertura muy baja. `--force` posible pero queda marcado en toda la metadata | ✅ | `test_build_refuses_wrong_timezone_unless_forced`, `test_build_refuses_wrong_base_timeframe`, `test_spread_units_sanity` |
| 1.8 | Remuestreo M1→D1 sin look-ahead (`close_time` explícito, D1 = día de trading 17:00 NY); cada TF derivado validado y con sus huecos en metadata | ✅ | `test_resample_mtf.py` |
| 1.9 | Metadata por TF (fuente, zona, base de precio, tipo de volumen, periodo, calidad, huecos, hash) + informe legible `data/metadata/<INST>_quality.md`; carga con verificación de hash | ✅ | `test_integrity_check_rejects_modified_file`, `XAUUSD_quality.md` |
| 1.10 | **Ingesta de datos reales de XAUUSD** (export MT5 del usuario) con diagnóstico global OK/INFO o con cada WARN explicado | ⏳ | pendiente de recibir datos: este entorno no tiene acceso a fuentes de datos externas |
| 1.11 | Documentación | ✅ | `DATA.md`, este fichero, comentarios en `config/data.yaml` |

Tests de la fase 1: `tests/test_data.py`, `tests/test_data_phase1.py`, `tests/test_resample_mtf.py`,
`tests/test_sessions_time.py` — se ejecutan con `python -m pytest tests/test_data*.py tests/test_resample_mtf.py tests/test_sessions_time.py`.
Los tests de diagnóstico se verificaron también por mutación (romper la lógica a propósito hace fallar 5 tests).

### Cómo cerrar 1.10

1. Exportar XAUUSD M1 desde MT5 (cuanto más histórico, mejor; varios ficheros valen) a `data/raw/`.
2. `config/data.yaml`: `source: mt5_csv`, `raw_path: data/raw/XAUUSD_M1_*.csv`, `source_timezone` del servidor.
3. `python scripts/build_dataset.py` — si la zona horaria es incorrecta el build se detiene y dice cuántas horas
   se desvía.
4. Revisar `data/metadata/XAUUSD_quality.md`: huecos inesperados (¿festivos?), cobertura por año, ticks
   sospechosos, spread por hora.
5. Documentar el resultado aquí y cerrar la fase.
