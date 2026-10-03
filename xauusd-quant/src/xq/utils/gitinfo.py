"""Git metadata for experiment reproducibility."""

from __future__ import annotations

import subprocess
from pathlib import Path


def _git(args: list[str], cwd: Path) -> str | None:
    try:
        return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def git_info(cwd: Path) -> dict:
    commit = _git(["rev-parse", "HEAD"], cwd)
    status = _git(["status", "--porcelain", "--", "src", "config", "scripts"], cwd)
    return {"git_commit": commit, "git_dirty": bool(status) if status is not None else None}
