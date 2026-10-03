# Datos

## Esquema canónico

| campo | tipo | notas |
|---|---|---|
| índice `timestamp` | datetime UTC tz-aware | **apertura** de la barra; único y creciente |
| open/high/low/close | float | precio en USD/oz; `price_basis` = `bid` (MT5) o `mid` |
| volume | float | **tick o real** según `metadata.volume_type` — no son equivalentes |
| spread | float, opcional | en **unidades de precio** (MT5 lo da en puntos; el loader multiplica por `point_size`) |
| close_time | datetime, opcional | sólo en barras remuestreadas: instante en que la barra puede usarse |
| n_source_bars | int, opcional | barras M1 agregadas (detecta barras incompletas) |

## Fuentes (`config/data.yaml → source`)

- `mt5_csv` — export de barras de MT5 (tabuladores o comas). Detecta si `<VOL>` (real) tiene datos; si no, usa `<TICKVOL>` y lo marca
  como `tick`. En CFDs de oro el volumen es casi siempre **tick volume** (nº de cambios de precio del broker),
  no volumen negociado. Los análisis de volumen deben tenerlo en cuenta.
- `generic_csv` — cualquier CSV con `csv_column_map` (`timestamp`, o `date` + `time`; si el timestamp trae zona
  propia, se respeta y se ignora `source_timezone`).
- `parquet` / `synthetic` — ya canónico.

Ningún módulo fuera de `data/loaders.py` conoce el formato del broker.

## Zonas horarias

`source_timezone` describe el reloj del fichero bruto. Valores:
- nombre IANA (`UTC`, `Europe/Athens`…);
- `NY+7`: servidores MT5 "New York close" (hora servidor = hora de Nueva York + 7 h, de modo que la vela diaria
  abre siempre a las 17:00 NY, todo el año). Es la convención más habitual y **no** coincide con
  `Europe/Athens` en las semanas en que el DST de EE. UU. y Europa no está sincronizado.

Las horas locales ambiguas/inexistentes (cambio de hora) se **descartan y se cuentan** en
`quality.dst_ambiguous_or_nonexistent_dropped`; nunca se adivinan.

## Varios ficheros

`raw_path` admite un glob (`data/raw/XAUUSD_M1_*.csv`). Se cargan en orden alfabético y se concatenan; en
timestamps solapados **gana el fichero anterior**. Los duplicados idénticos se cuentan en `duplicates_removed`;
los que tienen precios distintos además en `duplicate_conflicts` (dos fuentes que no coinciden → WARN). Si un
fichero trae volumen real y otro tick volume, el build se niega a mezclarlos.

## Diagnósticos (`data/diagnostics.py`) y puerta de calidad

Los diagnósticos **informan, no modifican**. Cada uno da `OK / INFO / WARN / FAIL`; el build se detiene con
cualquier `FAIL` (salvo `--force`, que queda registrado como `forced: true` en toda la metadata y en el
informe).

| diagnóstico | qué comprueba | FAIL cuando |
|---|---|---|
| `timeframe` | espaciado modal de las barras | no coincide con `base_timeframe` |
| `timezone` | hora del cierre semanal (vie 17:00 NY) y reapertura (dom 18:00 NY), separando semanas con y sin DST de EE. UU. | desfase > 45 min (fijo → zona equivocada; distinto según estación → regla DST equivocada). WARN si sólo algunas semanas se desvían exactamente 1 h (zona con calendario DST europeo para un servidor americano, p. ej. `Europe/Athens` en vez de `NY+7`) |
| `spread` | mediana en USD/oz | fuera de [0.01, 3] → casi seguro `point_size` erróneo |
| `spikes` | mechas > 20× el rango mediano local | nunca (lista para revisión manual; también salta en noticias reales) |
| `coverage` | barras presentes / esperadas por el calendario nominal, por año | < 85 % (WARN < 97 %). Los festivos no están modelados: cobertura < 100 % en datos reales es normal |
| `volume` | tipo y proporción de ceros | nunca; WARN si no hay volumen utilizable, INFO recordando que tick ≠ real |

Por qué la zona horaria es bloqueante: si está mal, todas las sesiones, la ventana 14:30–16:30 de Madrid, el
análisis por hora y el corte diario se desplazan sin que nada falle visiblemente.

## Integridad

`load_dataset` recalcula el hash del contenido y lo compara con la metadata; si alguien modificó el parquet sin
reconstruir, se niega a cargarlo (`DatasetIntegrityError`). Así un experimento siempre corresponde exactamente a
los datos descritos en su metadata.

## Informe de calidad

`scripts/build_dataset.py` (o `scripts/inspect_data.py`) escribe `data/metadata/<INST>_quality.md`: resumen,
diagnósticos, limpieza, comprobación de zona horaria, huecos e inesperados más grandes, cobertura por año,
actividad por hora (Madrid: barras, rango, volumen y spread medianos), ticks sospechosos y TF derivados.

## Limpieza y calidad

`clean_ohlcv` elimina (y cuenta) timestamps NaT, duplicados (identificando los conflictivos), precios NaN y filas OHLC imposibles. **No repara
precios.** `detect_gaps` clasifica huecos usando hora de Nueva York:
- `weekend`: viernes 17:00 → domingo 18:00 NY,
- `daily_break`: pausa diaria ~17:00–18:00 NY,
- `unexpected`: todo lo demás (festivos, cortes de feed) → listado en la metadata para revisión manual.

## Remuestreo

Barras etiquetadas por apertura (`label=left, closed=left`) con `close_time` explícito. **D1 usa el día de
trading del oro** (17:00 → 17:00 NY, con DST), no la medianoche UTC. H4 está alineado a UTC (00, 04, 08…); los
brokers suelen alinearlo a la hora del servidor; es un parámetro a investigar, no una verdad.

## Metadata

`data/metadata/<INSTRUMENTO>_<TF>.json`: fuente, sintético sí/no, zona horaria original, base de precio, tipo de
volumen, periodo, nº de barras, **hash del contenido**, informe de calidad, huecos por tipo, mediana/p99 del
spread. El hash se copia en cada experimento: si los datos cambian, el experimento deja de ser comparable y se
nota.

## Datos sintéticos

`data/synthetic.py` genera M1 "tipo oro": paseo aleatorio **sin deriva** con colas gruesas, clustering de
volatilidad, estacionalidad intradía, pausas y fines de semana reales, spread variable. **Por construcción no
contiene ninguna ventaja.** Sirve para probar el pipeline y como **test de hipótesis nula**: si una estrategia
gana significativamente antes de costes sobre estos datos, hay un bug (casi siempre look-ahead).
Los datos (`data/raw`, `data/processed`) no se versionan en git; la metadata sí.
