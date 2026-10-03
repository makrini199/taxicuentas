"""Static charts (matplotlib, Agg backend)."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

from xq.backtesting.metrics import monthly_table  # noqa: E402

INK, MUTED, POS, NEG, ACCENT = "#1f2937", "#6b7280", "#2a7d4f", "#b23b3b", "#2f5d8a"


def _style(ax, title: str) -> None:
    ax.set_title(title, loc="left", fontsize=11, color=INK)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.25)
    ax.tick_params(colors=MUTED, labelsize=8)


def _save(fig, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)
    return path.name


def equity_drawdown(equity: pd.DataFrame, path: Path, title: str) -> str:
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(10, 5.5), sharex=True, height_ratios=[3, 1.3])
    a1.plot(equity.index, equity["equity"], color=ACCENT, lw=1)
    _style(a1, f"Equity — {title}")
    a2.fill_between(equity.index, equity["drawdown"] * 100, 0, color=NEG, alpha=0.5, lw=0)
    _style(a2, "Drawdown %")
    return _save(fig, path)


def scenario_equity(curves: dict[str, pd.Series], path: Path) -> str:
    fig, ax = plt.subplots(figsize=(10, 4))
    colors = {"optimistic": POS, "base": ACCENT, "stress": NEG}
    for name, s in curves.items():
        ax.plot(s.index, s.to_numpy(), lw=1, label=name, color=colors.get(name))
    ax.legend(frameon=False, fontsize=8)
    _style(ax, "Equity by cost scenario")
    return _save(fig, path)


def r_distribution(trades: pd.DataFrame, path: Path) -> str:
    fig, ax = plt.subplots(figsize=(7, 3.5))
    r = trades["r_multiple"].dropna()
    ax.hist(r, bins=40, color=ACCENT, alpha=0.85)
    ax.axvline(r.mean(), color=NEG, lw=1, ls="--", label=f"mean {r.mean():.2f}R")
    ax.legend(frameon=False, fontsize=8)
    _style(ax, "R-multiple distribution")
    return _save(fig, path)


def monthly_heatmap(equity: pd.Series, path: Path) -> str:
    t = monthly_table(equity)
    fig, ax = plt.subplots(figsize=(10, 0.6 + 0.45 * len(t)))
    v = np.nanmax(np.abs(t.to_numpy())) if t.size else 1
    im = ax.imshow(t.to_numpy(), cmap="RdYlGn", vmin=-v, vmax=v, aspect="auto")
    ax.set_xticks(range(len(t.columns)), [str(c) for c in t.columns])
    ax.set_yticks(range(len(t.index)), [str(i) for i in t.index])
    for (y, x), val in np.ndenumerate(t.to_numpy()):
        if val == val:
            ax.text(x, y, f"{val:.1f}", ha="center", va="center", fontsize=7, color=INK)
    fig.colorbar(im, ax=ax, fraction=0.02)
    ax.set_title("Monthly return %", loc="left", fontsize=11, color=INK)
    return _save(fig, path)


def mae_mfe(trades: pd.DataFrame, path: Path) -> str:
    fig, ax = plt.subplots(figsize=(7, 4))
    win = trades["pnl"] > 0
    ax.scatter(trades.loc[~win, "mae_r"], trades.loc[~win, "mfe_r"], s=8, color=NEG, alpha=0.5, label="loss")
    ax.scatter(trades.loc[win, "mae_r"], trades.loc[win, "mfe_r"], s=8, color=POS, alpha=0.5, label="win")
    ax.set_xlabel("MAE (R)", fontsize=8)
    ax.set_ylabel("MFE (R)", fontsize=8)
    ax.legend(frameon=False, fontsize=8)
    _style(ax, "MAE vs MFE")
    return _save(fig, path)


def bar_breakdown(table: pd.DataFrame, col: str, path: Path, title: str) -> str:
    fig, ax = plt.subplots(figsize=(8, 3.2))
    vals = table[col]
    ax.bar([str(i) for i in table.index], vals, color=[POS if v > 0 else NEG for v in vals])
    ax.axhline(0, color=MUTED, lw=0.8)
    ax.tick_params(axis="x", rotation=30)
    _style(ax, title)
    return _save(fig, path)
