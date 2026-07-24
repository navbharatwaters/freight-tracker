"""
Regression tests for the freight rate parser.

fixtures/ocean_star_rates.csv is known-good output from the 14 archived
Ocean Star emails. These tests pin that behaviour. If they fail after a
parser change, the parser is wrong -- not the fixture.

    pytest tests/ -v
"""
import csv
import re
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
FIXTURE = ROOT / "fixtures" / "ocean_star_rates.csv"
EMAILS = ROOT / "fixtures" / "emails"        # drop the .eml files here

ORIGINS = {
    "SHENZHEN", "SHEKOU", "NANSHA", "NINGBO", "SHANGHAI", "QINGDAO",
    "TIANJIN", "XIAMEN", "DALIAN", "GUANGZHOU", "FUZHOU", "YANTIAN",
}
DESTS = {"NHAVA SHEVA", "CHENNAI", "KOLKATA", "MUNDRA"}


def load(path):
    with open(path) as fh:
        return list(csv.DictReader(fh))


@pytest.fixture(scope="module")
def baseline():
    return load(FIXTURE)


@pytest.fixture(scope="module")
def parsed():
    """Re-run the parser over the archived emails."""
    if not EMAILS.exists():
        pytest.skip(f"no emails at {EMAILS}")
    out = Path(tempfile.mkdtemp()) / "out.csv"
    subprocess.run(
        [sys.executable, str(ROOT / "parser" / "extract.py"), str(EMAILS), str(out)],
        check=True, capture_output=True,
    )
    return load(out)


# --- shape -----------------------------------------------------------------

def test_row_count(baseline):
    assert len(baseline) == 1541


def test_date_range(baseline):
    d = sorted({r["quote_date"] for r in baseline})
    assert d[0] == "2026-06-18"
    assert d[-1] == "2026-07-17"
    assert len(d) == 9, "9 distinct send dates -- agent mails irregularly"


def test_no_phantom_ports(baseline):
    """'Good day to you' matches /^X TO Y$/. The whitelist is what stops it."""
    bad = {r["origin_port"] for r in baseline} - ORIGINS
    assert not bad, f"unrecognised origins leaked through: {bad}"
    bad_d = {r["dest_port"] for r in baseline} - DESTS
    assert not bad_d, f"unrecognised destinations: {bad_d}"


def test_kolkata_normalised(baseline):
    """Agent writes CCU; it must land as KOLKATA."""
    assert "CCU" not in {r["dest_port"] for r in baseline}
    assert "KOLKATA" in {r["dest_port"] for r in baseline}


def test_no_nbsp(baseline):
    """HTML bodies carry \\u00a0. Unnormalised, it splits a lane in two."""
    for r in baseline:
        assert "\u00a0" not in r["origin_port"]
        assert "\u00a0" not in r["dest_port"]
        assert "  " not in r["dest_port"]


# --- container size asymmetry ----------------------------------------------

def test_hq_only_quotes(baseline):
    """
    "USD1500/40HQ" -> 40ft only, 20ft NULL.

    Only when 40HQ is the SIZE TOKEN in the rate pair. The agent also writes
    40HQ in trailing surcharge notes -- "USD2350/2550 ETD03-JUL,40HQ over
    24.9+OWS100" is a normal two-rate quote. Match the rate expression, not
    the whole line.
    """
    hq = [r for r in baseline if re.search(r"USD\s*\d+\s*/\s*40(HQ|GP)",
                                           r["raw_line"], re.I)]
    assert hq, "fixture should contain 40HQ-only quotes"
    for r in hq:
        assert r["rate_20"] == "", f"40HQ-only quote must not set 20ft: {r['raw_line']}"
        assert r["rate_40"], f"40HQ-only quote must set 40ft: {r['raw_line']}"


def test_gp_only_quotes(baseline):
    """"USD1600/20GP" -> 20ft only. Mirror of the 40HQ case, same caveat."""
    gp = [r for r in baseline if re.search(r"USD\s*\d+\s*/\s*20GP",
                                           r["raw_line"], re.I)]
    for r in gp:
        assert r["rate_40"] == "", f"20GP-only quote must not set 40ft: {r['raw_line']}"
        assert r["rate_20"], f"20GP-only quote must set 20ft: {r['raw_line']}"


def test_every_row_has_a_rate(baseline):
    for r in baseline:
        assert r["rate_20"] or r["rate_40"], f"row with no rate: {r['raw_line']}"


def test_rates_sane(baseline):
    """
    Agent typos are real: "MSC USD21950/1950" appears in the 8 Jul mail and is
    a fat-fingered 1950/1950. Unfiltered it lands as a $21,950 20ft container
    and drags that lane's mean up by ~$1,400.
    """
    for r in baseline:
        for k in ("rate_20", "rate_40"):
            if r[k]:
                assert 100 <= int(r[k]) <= 20000, f"{k}={r[k]} in {r['raw_line']}"


def test_implausible_spread_rejected(baseline):
    """20ft and 40ft on one lane track each other. A 10x gap is a typo."""
    for r in baseline:
        if r["rate_20"] and r["rate_40"]:
            a, b = int(r["rate_20"]), int(r["rate_40"])
            assert a <= b * 2 and b <= a * 3, f"implausible spread: {r['raw_line']}"


# --- published numbers ------------------------------------------------------

def mean_for(rows, date, origin, dest):
    sel = [r for r in rows if r["quote_date"] == date
           and r["origin_port"] == origin and r["dest_port"] == dest]
    r20 = [int(r["rate_20"]) for r in sel if r["rate_20"]]
    r40 = [int(r["rate_40"]) for r in sel if r["rate_40"]]
    return (round(sum(r20) / len(r20)) if r20 else None, len(r20),
            round(sum(r40) / len(r40)) if r40 else None, len(r40))


def test_shenzhen_latest(baseline):
    """The headline number on the page. Plain mean, both senders counted."""
    m20, n20, m40, n40 = mean_for(baseline, "2026-07-17", "SHENZHEN", "NHAVA SHEVA")
    assert (m20, n20) == (1560, 20)
    assert (m40, n40) == (1586, 26)


def test_shenzhen_trend_is_downward(baseline):
    """~-27% over the window. If this flips, something broke upstream."""
    lane = defaultdict(list)
    for r in baseline:
        if r["origin_port"] == "SHENZHEN" and r["dest_port"] == "NHAVA SHEVA" and r["rate_40"]:
            lane[r["quote_date"]].append(int(r["rate_40"]))
    series = [round(sum(v) / len(v)) for _, v in sorted(lane.items())]
    assert series[0] > series[-1]
    assert series[0] == 2185 and series[-1] == 1586


def test_both_senders_on_17th(baseline):
    """One agency, two reps. 17 Jul overlaps -- expected, not a bug."""
    s = {r["sender"] for r in baseline
         if r["quote_date"] == "2026-07-17" and r["origin_port"] == "SHENZHEN"}
    assert len(s) == 2


# --- parser still reproduces the fixture ------------------------------------

def test_parser_matches_fixture(parsed, baseline):
    """The real regression guard. Runs only if fixtures/emails/ is populated."""
    assert len(parsed) == len(baseline)
    key = lambda r: (r["quote_date"], r["origin_port"], r["dest_port"],
                     r["rate_20"], r["rate_40"], r["raw_line"])
    assert sorted(map(key, parsed)) == sorted(map(key, baseline))
