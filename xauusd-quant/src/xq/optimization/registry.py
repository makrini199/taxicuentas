"""Experiment registry (spec §26, §29, §36).

Every run gets a folder ``experiments/<ID>_<slug>/`` and a line in
``experiments/registry.jsonl``. Each entry stores a FINGERPRINT (strategy,
parameters, costs, risk, dataset hash, segment): re-running an identical
experiment is refused unless forced, so parameters can never change silently.

OOS PROTECTION: running on the 'oos' or 'full' segment requires an explicit
flag and is recorded. If the same strategy family has ALREADY been evaluated
on OOS, the new run is marked INVALIDATED — the OOS set has been seen, so any
result after re-tuning is contaminated (data snooping).
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

OOS_SEGMENTS = {"oos", "full"}


def fingerprint(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode()).hexdigest()[:16]


class ExperimentRegistry:
    def __init__(self, root: Path):
        self.root = Path(root)
        self.index = self.root / "registry.jsonl"

    def entries(self) -> list[dict]:
        if not self.index.exists():
            return []
        return [json.loads(line) for line in self.index.read_text(encoding="utf-8").splitlines() if line.strip()]

    def find_duplicate(self, fp: str) -> dict | None:
        return next((e for e in self.entries() if e.get("fingerprint") == fp and not e.get("invalidated")), None)

    def next_id(self, prefix: str = "EXP") -> str:
        nums = [int(m.group(1)) for e in self.entries() if (m := re.fullmatch(rf"{prefix}(\d+)", e["experiment_id"]))]
        return f"{prefix}{(max(nums) + 1 if nums else 1):03d}"

    def oos_check(self, strategy_family: str, segment: str) -> tuple[bool, str | None]:
        """Returns (oos_used, invalidation_reason)."""
        if segment not in OOS_SEGMENTS:
            return False, None
        prior = [e for e in self.entries() if e.get("strategy_family") == strategy_family and e.get("oos_used")]
        if prior:
            ids = ", ".join(e["experiment_id"] for e in prior)
            return True, f"OOS already consumed by {ids} for family '{strategy_family}' (data snooping)"
        return True, None

    def create_dir(self, exp_id: str, name: str) -> Path:
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40]
        d = self.root / f"{exp_id}_{slug}"
        if d.exists():
            raise FileExistsError(f"{d} already exists")
        d.mkdir(parents=True)
        return d

    def record(self, entry: dict) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        entry = {"recorded_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **entry}
        with self.index.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, default=str) + "\n")
