"""Raw file(s) (per config/data.yaml) -> cleaned, validated, diagnosed, resampled parquet
+ metadata + data/metadata/<INSTRUMENT>_quality.md.

Stops on any FAIL diagnostic (wrong timezone/timeframe/spread units...). --force builds
anyway and flags the dataset as forced everywhere.
"""
import argparse
import sys

import _bootstrap  # noqa: F401
from xq.config import load_config
from xq.data.pipeline import DataQualityError, build_dataset
from xq.data.quality_report import write_quality_report

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="build despite FAIL diagnostics (flagged)")
    a = ap.parse_args()
    cfg = load_config()
    try:
        build_dataset(cfg.data, force=a.force)
    except DataQualityError as e:
        print(f"\nBUILD STOPPED: {e}", file=sys.stderr)
        sys.exit(2)
    print(f"quality report -> {write_quality_report(cfg.data, cfg.sessions)}")
