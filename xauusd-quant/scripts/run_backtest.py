"""Run a registered experiment: all cost scenarios, report, registry entry.

Examples
  python scripts/run_backtest.py --name "pipeline smoke test" --id EXP000
  python scripts/run_backtest.py --name "..." --segment validation
  python scripts/run_backtest.py --name "final" --segment oos --confirm-oos   # once per family!
"""
import argparse

import _bootstrap  # noqa: F401
from xq.backtesting.splits import SEGMENTS
from xq.config import load_config
from xq.backtesting.runner import run_experiment

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--name", required=True)
    ap.add_argument("--hypothesis", default="")
    ap.add_argument("--notes", default="")
    ap.add_argument("--strategy", default=None, help="key in strategy.yaml (default: active)")
    ap.add_argument("--segment", default="train", choices=SEGMENTS)
    ap.add_argument("--id", default=None, help="experiment id (default: next EXPnnn)")
    ap.add_argument("--confirm-oos", action="store_true")
    ap.add_argument("--force", action="store_true", help="re-run an identical experiment")
    a = ap.parse_args()
    run_experiment(load_config(), name=a.name, hypothesis=a.hypothesis, notes=a.notes, strategy=a.strategy,
                   segment=a.segment, experiment_id=a.id, confirm_oos=a.confirm_oos, force=a.force)
