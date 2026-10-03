"""Raw file (per config/data.yaml) -> cleaned, validated, resampled parquet + metadata."""
import _bootstrap  # noqa: F401
from xq.config import load_config
from xq.data.pipeline import build_dataset

if __name__ == "__main__":
    build_dataset(load_config().data)
