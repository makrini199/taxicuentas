# Despliegue

**Estado actual: sólo investigación. No existe ninguna capa de ejecución ni conexión a brokers.**

Arquitectura objetivo (§40–43), con investigación y ejecución en paquetes separados:

```
DATA ─► SIGNAL ENGINE ─► RISK ENGINE ─► EXECUTION ENGINE ─► BROKER
        (mismo código     (mismas reglas    paper por defecto
         que el backtest)  que el backtest)
```

Reglas que se mantendrán cuando llegue la fase 17–18:

- `LIVE_TRADING=false` por defecto; la ejecución real exigirá `LIVE_TRADING=true` explícito y nunca se activará
  automáticamente.
- Fase MT5 inicial = **paper trading**: señal → validación de riesgo → ejecución simulada → log, con las mismas
  métricas que el backtest para comparar backtest vs. paper.
- Protecciones previstas: límite de pérdida diaria, tamaño máximo, nº máximo de operaciones, parada de
  emergencia, fallos de conexión, prevención de órdenes duplicadas, detección de señales caducadas, filtro de
  spread y de volatilidad anómala.
- La fase 18 (ejecución real) sólo tras aprobación explícita.
