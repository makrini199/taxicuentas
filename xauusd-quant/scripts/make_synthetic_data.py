"""Generate SYNTHETIC XAUUSD-like M1 data (random walk, no edge) into data/raw/."""
import argparse

import _bootstrap  # noqa: F401
from xq.config import load_config, resolve_path
from xq.data.synthetic import generate_synthetic_m1

if __name__ == "__main__":
    cfg = load_config().data
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--start", default=cfg.synthetic.start)
    ap.add_argument("--end", default=cfg.synthetic.end)
    ap.add_argument("--seed", type=int, default=cfg.synthetic.seed)
    a = ap.parse_args()
    df = generate_synthetic_m1(a.start, a.end, a.seed, cfg.synthetic.start_price, cfg.synthetic.annual_vol)
    out = resolve_path(cfg.raw_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(out)
    print(f"wrote {len(df):,} synthetic M1 bars -> {out}")
