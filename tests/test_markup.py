"""
Published-rate markup guard.

Every rate the website shows is the raw Ocean Star mean + MARKUP_USD (300),
both box sizes. The markup is applied on READ -- in the freight_index_daily
view and in update.py's index.json -- never at ingest. These tests pin:

  * the two read paths carry the same constant,
  * data/index.json == mean(data/rates.csv) + markup, lane by lane,
  * the raw layer (rates.csv, the parser fixture) is NOT marked up.

    pytest tests/ -v
"""
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from update import MARKUP_USD  # noqa: E402

DATA = ROOT / "data"


def test_markup_is_300():
    """Business decision 2026-09-19. Change deliberately, in both places."""
    assert MARKUP_USD == 300


@pytest.mark.parametrize("sql", ["db/schema.sql", "db/migration_003_markup.sql"])
def test_sql_view_uses_same_markup(sql):
    src = (ROOT / sql).read_text(encoding="utf-8")
    body = src[src.index("CREATE OR REPLACE VIEW freight_index_daily"):]
    body = body[: body.index("FROM freight_quotes")]
    for col in ("rate_20", "rate_40", "min_40", "max_40"):
        m = re.search(rf"\+\s*(\d+)\s+AS {col}\b", body)
        assert m, f"{sql}: {col} has no markup"
        assert int(m.group(1)) == MARKUP_USD, f"{sql}: {col} markup drifted"
    assert re.search(rf"\b{MARKUP_USD}\s+AS markup_usd\b", body), f"{sql}: markup_usd column"


@pytest.fixture(scope="module")
def raw_means():
    p = DATA / "rates.csv"
    if not p.exists():
        pytest.skip("run `python update.py` first")
    agg = defaultdict(lambda: {"r20": [], "r40": []})
    with open(p, encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            k = (r["quote_date"], r["origin_port"], r["dest_port"])
            if r["rate_20"]:
                agg[k]["r20"].append(int(r["rate_20"]))
            if r["rate_40"]:
                agg[k]["r40"].append(int(r["rate_40"]))
    return {
        k: (round(sum(v["r20"]) / len(v["r20"])) if v["r20"] else None,
            round(sum(v["r40"]) / len(v["r40"])) if v["r40"] else None)
        for k, v in agg.items()
    }


@pytest.fixture(scope="module")
def index():
    p = DATA / "index.json"
    if not p.exists():
        pytest.skip("run `python update.py` first")
    return json.loads(p.read_text(encoding="utf-8"))


def test_index_json_is_raw_mean_plus_markup(raw_means, index):
    assert index, "index.json empty"
    for row in index:
        m20, m40 = raw_means[(row["date"], row["origin"], row["dest"])]
        assert row["rate20"] == (None if m20 is None else m20 + MARKUP_USD), row
        assert row["rate40"] == (None if m40 is None else m40 + MARKUP_USD), row


def test_shenzhen_17jul_published(index):
    """Headline lane. Fixture asserts raw $1560/$1586; the page shows +300."""
    row = next(r for r in index
               if (r["date"], r["origin"], r["dest"]) == ("2026-07-17", "SHENZHEN", "NHAVA SHEVA"))
    assert row["rate20"] == 1560 + MARKUP_USD == 1860
    assert row["rate40"] == 1586 + MARKUP_USD == 1886


def test_raw_layer_not_marked_up(raw_means):
    """Applying markup at ingest would double it on read. Raw must stay raw."""
    assert raw_means[("2026-07-17", "SHENZHEN", "NHAVA SHEVA")] == (1560, 1586)
