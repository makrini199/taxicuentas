"""Re-generate the data-quality report from the processed dataset and print it."""
import _bootstrap  # noqa: F401
from xq.config import load_config
from xq.data.quality_report import build_quality_report, write_quality_report

if __name__ == "__main__":
    cfg = load_config()
    write_quality_report(cfg.data, cfg.sessions)
    print(build_quality_report(cfg.data, cfg.sessions))
