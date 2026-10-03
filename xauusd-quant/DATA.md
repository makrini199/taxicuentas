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

- `mt5_csv` — export de barras de MT5. Detecta si `<VOL>` (real) tiene datos; si no, usa `<TICKVOL>` y lo marca
  como `tick`. En CFDs de oro el volumen es casi siempre **tick volume** (nº de cambios de precio del broker),
  no volumen negociado. Los análisis de volumen deben tenerlo en cuenta.
- `generic_csv` — cualquier CSV con `csv_column_map`.
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

## Limpieza y calidad

`clean_ohlcv` elimina (y cuenta) timestamps NaT, duplicados, precios NaN y filas OHLC imposibles. **No repara
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
