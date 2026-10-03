import json

import pytest

from xq.backtesting.runner import run_experiment
from xq.data.pipeline import build_dataset
from xq.data.synthetic import generate_synthetic_m1
from xq.optimization.registry import ExperimentRegistry, fingerprint


def test_registry_ids_duplicates_and_oos(tmp_path):
    reg = ExperimentRegistry(tmp_path)
    assert reg.next_id() == "EXP001"
    reg.record({"experiment_id": "EXP001", "fingerprint": "abc", "strategy_family": "s", "oos_used": False})
    assert reg.next_id() == "EXP002"
    assert reg.find_duplicate("abc")["experiment_id"] == "EXP001"
    assert reg.oos_check("s", "train") == (False, None)
    assert reg.oos_check("s", "oos") == (True, None)
    reg.record({"experiment_id": "EXP002", "fingerprint": "x", "strategy_family": "s", "oos_used": True})
    used, reason = reg.oos_check("s", "oos")
    assert used and "EXP002" in reason
    assert fingerprint({"a": 1, "b": 2}) == fingerprint({"b": 2, "a": 1})


@pytest.fixture
def tiny_project(cfg, tmp_path):
    raw = tmp_path / "raw.parquet"
    generate_synthetic_m1("2021-01-04", "2021-03-31", seed=2).to_parquet(raw)
    data = cfg.data.model_copy(update={
        "raw_path": str(raw), "processed_dir": str(tmp_path / "proc"), "metadata_dir": str(tmp_path / "meta"),
        "timeframes": ["M1", "M5"],
        "splits": cfg.data.splits.model_copy(update={"train_end": "2021-02-15", "validation_end": "2021-03-08"}),
    })
    build_dataset(data, log=lambda *_: None)
    return cfg.model_copy(update={"data": data})


def test_end_to_end_experiment(tiny_project, tmp_path):
    exps = tmp_path / "exps"
    out = run_experiment(tiny_project, name="smoke", segment="train", experiments_dir=exps, log=lambda *_: None)
    for f in ("report.md", "config.yaml", "meta.json", "results.json", "trades.csv", "rejected_signals.csv"):
        assert (out / f).exists(), f
    meta = json.loads((out / "meta.json").read_text())
    assert meta["segment_end"] < "2021-02-15" and meta["oos_used"] is False
    report = (out / "report.md").read_text()
    for section in ("## Overfitting risk", "## Final status", "## Walk-forward", "SYNTHETIC"):
        assert section in report
    assert meta["status"] in ("REJECT", "RESEARCH")
    with pytest.raises(FileExistsError, match="identical"):
        run_experiment(tiny_project, name="smoke again", segment="train", experiments_dir=exps, log=lambda *_: None)


def test_oos_requires_confirmation_and_second_use_is_invalidated(tiny_project, tmp_path):
    exps = tmp_path / "exps"
    with pytest.raises(PermissionError):
        run_experiment(tiny_project, name="peek", segment="oos", experiments_dir=exps, log=lambda *_: None)
    first = run_experiment(tiny_project, name="final", segment="oos", confirm_oos=True, experiments_dir=exps,
                           log=lambda *_: None)
    assert json.loads((first / "meta.json").read_text())["invalidated"] is False
    second = run_experiment(tiny_project, name="final again", segment="oos", confirm_oos=True, force=True,
                            experiments_dir=exps, log=lambda *_: None)
    m = json.loads((second / "meta.json").read_text())
    assert m["invalidated"] is True and m["status"] == "INVALIDATED"
