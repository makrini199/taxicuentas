# XAUUSD QUANT RESEARCH & TRADING SYSTEM — MASTER PROJECT SPECIFICATION — V1

> Especificación maestra del proyecto. Contenido íntegro; sólo se ha compactado el formato (listas en línea).
> **Nota:** el texto llegó truncado a mitad de la sección 55 ("Si se cambia una regla: crear una nuev…").
> Las secciones 1–54 están completas. Completar §55 y siguientes cuando estén disponibles.

## 0. ROL

Actúa como un equipo compuesto por: Quant researcher, Quant developer, Python developer, Algorithmic trading engineer, Backtesting specialist, Risk manager, Data engineer, QA engineer.

Tu objetivo NO es simplemente crear un bot que gane dinero en un backtest. Tu objetivo es construir un sistema de investigación cuantitativa capaz de determinar, de forma reproducible y estadísticamente razonable, si existen ventajas operativas explotables en XAUUSD.

Debes ser extremadamente crítico con los resultados. Un backtest positivo NO significa que una estrategia sea válida. Debes intentar destruir tus propias hipótesis mediante: out-of-sample testing, walk-forward testing, Monte Carlo, sensibilidad de parámetros, análisis por régimen, costes de ejecución, slippage, spread, latencia, estabilidad temporal, pruebas de robustez.

Nunca ocultes resultados negativos. Un resultado negativo es información útil.

## 1. OBJETIVO PRINCIPAL

Construir un sistema completo para investigar y eventualmente automatizar estrategias sobre XAUUSD — Gold / US Dollar.

La investigación inicial se basará en: Wyckoff, Smart Money Concepts, Price Action, Liquidity, Market Structure, Volume, RSI, Multi-Timeframe Analysis.

Se crearán inicialmente dos familias de estrategias:

- **SYSTEM A — TREND FOLLOWING.** Busca incorporarse a movimientos direccionales después de confirmación estructural.
- **SYSTEM B — COUNTER-TREND / REVERSAL.** Busca capturar giros después de barridos de liquidez, agotamiento y cambio estructural.

No asumir que ninguno de los dos sistemas es rentable. Los dos deben demostrarlo mediante pruebas.

## 2. PRINCIPIO FUNDAMENTAL

NO optimices para maximizar el beneficio histórico. Optimiza para maximizar: ROBUSTEZ + EXPECTANCY + ESTABILIDAD + CONTROL DEL RIESGO.

Una estrategia ligeramente menos rentable pero estable fuera de muestra es preferible a una estrategia espectacular pero sobreajustada. Nunca selecciones una estrategia simplemente porque tenga mayor Net Profit, mayor Win Rate, mayor Sharpe o mayor Profit Factor. Analiza siempre el conjunto completo de métricas.

## 3. REGLAS ABSOLUTAS CONTRA LOOK-AHEAD BIAS

El sistema debe impedir cualquier forma de: look-ahead bias, future leak, repainting, utilización accidental de información futura, utilización de máximos/mínimos futuros antes de estar confirmados, selección retrospectiva de operaciones, optimización utilizando datos OOS.

Toda señal debe poder calcularse exclusivamente con información disponible en ese instante. Documenta explícitamente cómo se evita cada uno de estos problemas.

## 4. ARQUITECTURA GENERAL

DATA → DATA CLEANING → FEATURE ENGINEERING → WYCKOFF ENGINE → SMC ENGINE → VOLUME ENGINE → RSI ENGINE → MARKET STRUCTURE ENGINE → MULTI-TIMEFRAME ENGINE → SIGNAL SCORING ENGINE → STRATEGY ENGINE → RISK ENGINE → EXECUTION SIMULATOR → BACKTEST ENGINE → ANALYTICS ENGINE → ROBUSTNESS ENGINE → WALK-FORWARD ENGINE → MONTE CARLO ENGINE → REPORTING

Todos los módulos deben estar desacoplados. No construyas un único script gigantesco.

## 5. TECNOLOGÍA

Prioridad: Python. Utiliza librerías maduras cuando sean apropiadas (pandas, numpy, scipy, matplotlib, statsmodels, scikit-learn cuando tenga sentido, pydantic, pytest, PyYAML, SQL/Parquet). Puedes incorporar otras librerías si existe una razón técnica clara. No añadas dependencias innecesarias.

## 6. ESTRUCTURA DEL PROYECTO

```
xauusd-quant/
├── README.md, MASTER_PROMPT.md, requirements.txt, pyproject.toml, .gitignore
├── config/ (strategy.yaml, risk.yaml, data.yaml, backtest.yaml)
├── data/ (raw/, processed/, metadata/)
├── src/ (data, features, wyckoff, smc, volume, rsi, structure, mtf, strategies, risk,
│         execution, backtesting, robustness, optimization, reporting, utils)
├── tests/, experiments/, reports/, notebooks/, scripts/
```

## 7. DATOS

Diseña el sistema para trabajar con datos OHLCV. Como mínimo: timestamp, open, high, low, close, volume, spread (si está disponible). El sistema debe permitir diferentes fuentes de datos. No acoples todo el proyecto a un único broker.

Debes almacenar metadata: fuente, instrumento, timezone, timeframe, periodo, calidad, gaps, volumen utilizado, tipo de volumen.

IMPORTANTE: Distingue tick volume y real volume. No los trates como equivalentes.

## 8. TIMEFRAMES

M1, M5, M15, M30, H1, H4, D1. La configuración debe ser modificable sin tocar el código. Configuración inicial sugerida: HTF H4 / H1; MTF M15; ENTRY M5 / M1. No asumas que esta combinación es óptima. Debe poder investigarse.

## 9. WYCKOFF ENGINE

Crear detección algorítmica de conceptos Wyckoff.
Accumulation: Preliminary Support, Selling Climax, Automatic Rally, Secondary Test, Spring, Sign of Strength, Last Point of Support.
Distribution: Preliminary Supply, Buying Climax, Automatic Reaction, Secondary Test, Upthrust, Sign of Weakness, Last Point of Supply.
No fuerces una etiqueta cuando la evidencia sea insuficiente. Cada detección debe tener: pattern, confidence, timestamp, price, timeframe, evidence.

## 10. SMC ENGINE

Market Structure: swing highs, swing lows, BOS, CHOCH.
Liquidity: equal highs, equal lows, previous highs, previous lows, session highs/lows, liquidity sweeps.
Zones: Order Blocks, Fair Value Gaps, imbalance, mitigation.
Cada elemento debe incluir: type, timeframe, price_range, timestamp, status, confidence.
Evita redefinir retroactivamente una estructura ya utilizada por una operación.

## 11. VOLUME ENGINE

Investigar: relative volume, volume spikes, volume confirmation, volume exhaustion, breakout volume, reversal volume. Crear variables normalizadas, p. ej. `relative_volume = current_volume / rolling_mean(volume, N)`. Pero NO asumir que N concreto es óptimo. Debe investigarse.

## 12. RSI ENGINE

RSI configurable (inicialmente length = 14, investigable). Detectar: overbought, oversold, bullish divergence, bearish divergence, hidden divergence. La divergencia debe definirse matemáticamente. No utilizar interpretación visual retrospectiva.

## 13. MARKET STRUCTURE ENGINE

Motor independiente que identifique HH, HL, LH, LL, BOS, CHOCH. Debe ser consistente. Evitar definiciones ambiguas. Documentar exactamente cómo se define cada swing.

## 14. MULTI-TIMEFRAME ENGINE

Combinar información entre temporalidades. Ejemplo: H1 → tendencia; M15 → estructura; M5 → setup; M1 → entrada. Es una hipótesis inicial, NO una regla definitiva. Investigar otras combinaciones. Nunca utilizar una vela HTF antes de que haya cerrado si la estrategia requiere confirmación.

## 15. SYSTEM A — TREND

HTF bias + market structure + liquidity event + BOS/CHOCH + retest + volume confirmation + optional RSI confirmation.
Ejemplo conceptual: HTF bullish ↓ liquidity sweep ↓ bullish CHOCH/BOS ↓ retest OB/FVG ↓ volume confirmation ↓ LONG. Para SHORT: invertir las condiciones. No convertir este ejemplo en una regla rígida. Investigar variantes.

## 16. SYSTEM B — REVERSAL

liquidity sweep + exhaustion + Wyckoff event + RSI divergence + structure shift + volume confirmation.
Ejemplo: liquidity sweep ↓ Wyckoff Spring / Upthrust ↓ RSI divergence ↓ CHOCH ↓ volume confirmation ↓ ENTRY. NO asumir que esto es rentable. Debe comprobarse.

## 17. SIGNAL SCORING

Scoring configurable (structure, liquidity sweep, Wyckoff, volume, RSI divergence, MTF alignment, OB/FVG, session: +X cada uno). El score debe ser configurable desde YAML. No hardcodear pesos. Investigar posteriormente si los pesos aportan realmente valor.

## 18. GOLDEN HOURS

Investigar específicamente 14:30–16:30 hora española (hipótesis inicial: ventana de mayor interés alrededor de la apertura estadounidense). No asumir que esta ventana es superior. Comparar contra: resto del día, Londres, Asia, NY, solapamiento Londres/NY, diferentes ventanas de 30/60/90/120 minutos. Tener especial cuidado con cambios horarios entre España y Estados Unidos. Utilizar timezone-aware timestamps.

## 19. DAY-OF-WEEK ANALYSIS

Analizar Monday–Friday. No asumir previamente que miércoles o jueves son mejores. Mostrar estadísticas reales.

## 20. RISK ENGINE

Nunca arriesgar una cantidad fija sin contexto. Soportar: risk_per_trade, max_daily_loss, max_weekly_loss, max_drawdown, max_consecutive_losses, max_open_positions. Sizing basado en account_equity, risk_percentage, stop_distance, instrument_value. Contemplar spread, commission, slippage, swap si corresponde.

## 21. STOP LOSS / TAKE PROFIT

SL: structure-based, ATR-based (ATR × multiplier), liquidity-based, hybrid. TP: fixed RR, structure target, liquidity target, trailing, partial exits. No asumir que un RR fijo es óptimo.

## 22. BACKTEST ENGINE

Mínimo: Net Profit, Gross Profit, Gross Loss, Profit Factor, Win Rate, Loss Rate, Expectancy, Average Win, Average Loss, Max Drawdown, Average Drawdown, Sharpe, Sortino, Calmar, Recovery Factor, Number of Trades, Average Trade, Largest Win, Largest Loss, Max Consecutive Wins, Max Consecutive Losses. Además: equity curve, drawdown curve, monthly returns, yearly returns, distribution of trades.

## 23. TRADE LOG

entry_time, exit_time, direction, entry_price, exit_price, stop_loss, take_profit, position_size, risk, PnL, R_multiple, strategy, setup, score, timeframe, session, day_of_week, market_regime, spread, slippage, MAE, MFE.

## 24. MAE / MFE

Calcular MAE y MFE. Usarlos para estudiar stops demasiado ajustados/amplios, TP demasiado conservadores, potencial de trailing, estructura óptima de salida.

## 25. REGIME DETECTION

trending, ranging, high/low volatility, high/low volume. No asumir que una estrategia funciona igual en todos. El informe debe indicar strategy performance by regime.

## 26. OPTIMIZATION

Framework de experimentación. Nunca modificar silenciosamente parámetros. Cada experimento genera: experiment_id, date, git_commit, parameters, dataset, results, notes.

## 27. PARAMETER SENSITIVITY

Una estrategia robusta no debería funcionar únicamente con RSI = 13 y fallar con 12/14/15. Investigar superficies de parámetros. Buscar zonas estables, no picos.

## 28. WALK-FORWARD

TRAIN ↓ VALIDATE ↓ TEST ↓ MOVE WINDOW ↓ RETRAIN ↓ TEST. Nunca utilizar información futura. Informe de cada ventana.

## 29. OUT-OF-SAMPLE

Separar TRAIN / VALIDATION / OUT-OF-SAMPLE. El dataset OOS debe permanecer protegido. Nunca usar OOS para elegir parámetros. Si se utiliza accidentalmente: MARCAR EL EXPERIMENTO COMO INVALIDADO.

## 30. MONTE CARLO

Sobre secuencia de operaciones, retornos, slippage, win rate, pérdidas, variación de resultados. Estimar distribución de drawdown, probabilidad de alcanzar determinado DD, distribución de equity, riesgo de ruina. No presentar Monte Carlo como predicción del futuro. Es una prueba de robustez.

## 31. COSTES REALISTAS

spread, commission, slippage, swap, latency. Escenarios: Optimistic (costes bajos), Base (razonables), Stress (elevados). Una estrategia que sólo funciona sin costes debe considerarse sospechosa.

## 32. OVERFITTING DETECTION

Señales: demasiados parámetros, reglas excesivamente específicas, PF extremadamente alto, pocas operaciones, resultados concentrados en pocos días, dependencia de una hora exacta, de un año concreto, de un único mercado/régimen, caída extrema OOS. Apartado OVERFITTING RISK en cada informe.

## 33. STRATEGY ACCEPTANCE CRITERIA

No declarar "production ready" sólo por rentabilidad. Evaluar: A. Statistical robustness, B. Out-of-sample performance, C. Walk-forward stability, D. Parameter stability, E. Cost robustness, F. Drawdown, G. Trade count, H. Regime robustness, I. Monte Carlo robustness, J. Operational reliability. Si falla alguno importante: STATUS = REJECT / RESEARCH. No ocultarlo.

## 34. AUTOMATED RESEARCH LOOP

GENERATE HYPOTHESIS ↓ CREATE EXPERIMENT ↓ RUN BACKTEST ↓ ANALYZE ↓ ROBUSTNESS TEST ↓ COMPARE ↓ KEEP / REJECT ↓ GENERATE NEXT HYPOTHESIS. Evitar repetir experimentos equivalentes. Mantener un registro.

## 35. CLAUDE AS RESEARCHER

Claude puede proponer nuevas combinaciones, filtros, ventanas, SL/TP, timeframes, scoring systems, definiciones cuantitativas. Cada propuesta debe convertirse en un experimento reproducible. Nunca aceptar una hipótesis simplemente porque "parece tener sentido".

## 36. EXPERIMENT DATABASE

`experiments/EXP001/, EXP002/, ...` Cada experimento contiene: config, results, trades, charts, analysis, commit.

## 37. REPORTING

Cada informe: Summary, Strategy, Dataset, Parameters, Performance, Drawdown, Trade statistics, Session analysis, Day-of-week analysis, Monthly analysis, Regime analysis, MAE/MFE, Parameter sensitivity, Walk-forward, OOS, Monte Carlo, Overfitting risk, Final status.

## 38. VISUALIZATION

equity curve, drawdown, monthly heatmap, PnL distribution, R distribution, MAE/MFE, hourly performance, day-of-week performance, session performance, parameter sensitivity, trade examples.

## 39. TRADINGVIEW / PINE

Después de validar una estrategia: versión Pine Script que replique exactamente la lógica validada. No modificar silenciosamente la estrategia. Documentar diferencias por limitaciones de TradingView. Incluir: entradas, SL, TP, score, señales, alertas, dashboard.

## 40. MT5

Tras la fase de investigación: arquitectura compatible con MetaTrader 5. Inicialmente PAPER TRADING ONLY. Nunca enviar órdenes reales por defecto. signal → risk validation → simulated execution → logging. Posteriormente, una capa de ejecución real separada.

## 41. LIVE TRADING SAFETY

La ejecución real requiere explícitamente `LIVE_TRADING=true`. Nunca activarlo automáticamente. Por defecto `LIVE_TRADING=false`. Protecciones: daily loss limit, max position size, max open trades, emergency stop, connection failure handling, duplicate order prevention, stale signal detection, spread filter, abnormal volatility filter.

## 42. PAPER TRADING

Antes de dinero real: mínimo una fase de forward testing. Registrar las mismas métricas que el backtest. Comparar BACKTEST vs PAPER. Analizar diferencias.

## 43. DEPLOYMENT

DATA ↓ SIGNAL ENGINE ↓ RISK ENGINE ↓ EXECUTION ENGINE ↓ BROKER. Mantener investigación y ejecución separadas.

## 44. TESTING

Tests para: market structure, BOS, CHOCH, liquidity sweep, RSI divergence, Wyckoff patterns, position sizing, SL/TP, PnL, timezone, session detection, no-lookahead, backtest consistency. Nunca considerar el proyecto terminado sin tests.

## 45. GIT

Commits pequeños y descriptivos (feat: add market structure engine, test: validate no lookahead, ...). Nunca mezclar grandes cantidades de cambios sin explicación.

## 46. DOCUMENTATION

Mantener actualizado: README.md, ARCHITECTURE.md, STRATEGY.md, DATA.md, BACKTESTING.md, RISK.md, EXPERIMENTS.md, DEPLOYMENT.md. Cualquier decisión importante debe quedar documentada.

## 47. RESEARCH PRIORITIES

Orden obligatorio: 1 Data infrastructure · 2 Backtesting engine · 3 Market structure · 4 SMC · 5 Wyckoff · 6 Volume · 7 RSI · 8 System A · 9 System B · 10 Risk engine · 11 Robustness · 12 Walk-forward · 13 OOS · 14 Monte Carlo · 15 Automated research · 16 Pine Script · 17 MT5 paper trading · 18 Only after explicit approval: live execution architecture. No saltarse fases.

## 48. FIRST MILESTONE

NO intentes construir todo de golpe. Primero: PROJECT SKELETON + DATA PIPELINE + BACKTEST ENGINE + BASIC MARKET STRUCTURE + TESTS. Después ejecuta un primer backtest simple. No importa si pierde. Necesitamos demostrar que el pipeline funciona correctamente.

## 49. FIRST RESEARCH EXPERIMENT

Después del pipeline: EXP001. Hipótesis: «Existe una ventaja estadística cuando una ruptura estructural confirmada coincide con un evento de liquidez y confirmación de volumen durante una ventana de alta actividad de XAUUSD.» No añadir todavía todas las variables. Construir primero una baseline sencilla. Después añadir complejidad incrementalmente.

## 50. ABLATION TESTING

Comparar: BASE, BASE + SMC, BASE + WYCKOFF, BASE + VOLUME, BASE + RSI, BASE + MTF, BASE + SESSION. Objetivo: descubrir qué componentes realmente mejoran la estrategia. No asumir que añadir más indicadores mejora el sistema.

## 51. RESEARCH DISCIPLINE

Cada vez que encuentres una mejora pregunta: «¿Es realmente una mejora o simplemente overfitting?» Realiza OOS, walk-forward, parameter perturbation, cost stress, Monte Carlo antes de considerarla válida.

## 52. GOLDEN HOURS RESEARCH

EXP-GOLDEN-HOURS. Comparar 00:00–06:00, 06:00–09:00, 09:00–12:00, 12:00–14:30, 14:30–15:30, 15:30–16:30, 16:30–18:00, 18:00–22:00. Ajustar según timezone y daylight saving. No asumir que 14:30–16:30 es óptimo. Encontrar evidencia.

## 53. DAY ANALYSIS

EXP-DAYS. Comparar Monday–Friday. Analizar trades, win rate, expectancy, PF, DD, average movement, MFE, MAE.

## 54. PIP / PRICE MOVEMENT ANALYSIS

Analizar average move, median move, maximum move, ATR, session range, opening range, continuation, reversal. Especialmente 14:30–16:30 Spain time.

## 55. NO CHERRY PICKING

No seleccionar únicamente las mejores operaciones. Todos los trades válidos deben estar incluidos. No eliminar operaciones perdedoras porque "el setup no era perfecto". Si se cambia una regla: crear una nuev… *(texto truncado en el original)*
