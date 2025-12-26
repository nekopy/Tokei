from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _latest_apl_entry(cache: dict[str, Any]) -> dict[str, Any] | None:
    items = cache.get("list")
    if not isinstance(items, list) or not items:
        return None
    best: dict[str, Any] | None = None
    best_no: int | None = None
    for item in items:
        if not isinstance(item, dict):
            continue
        no = item.get("reportNo")
        if not isinstance(no, int) or no <= 0:
            continue
        if best_no is None or no > best_no:
            best_no = no
            best = item
    return best


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--apl-cache", required=True, help="Path to APL cache.json (autoprogresslog/cache.json)")
    p.add_argument("--hashi-stats", required=True, help="Path to Hashi anki_stats_snapshot.json")
    args = p.parse_args(argv[1:])

    apl_path = Path(args.apl_cache)
    hashi_path = Path(args.hashi_stats)

    apl = _load_json(apl_path)
    if not isinstance(apl, dict):
        raise SystemExit("APL cache must be a JSON object.")
    entry = _latest_apl_entry(apl)
    if not entry:
        raise SystemExit("Could not find any APL report entries in cache.json (list/reportNo).")

    apl_ret = entry.get("retention")
    apl_total = entry.get("totalCardsStudied")
    if not isinstance(apl_ret, (int, float)) or not isinstance(apl_total, (int, float)):
        raise SystemExit("APL cache entry missing numeric retention/totalCardsStudied.")

    hashi = _load_json(hashi_path)
    if not isinstance(hashi, dict):
        raise SystemExit("Hashi stats must be a JSON object.")
    totals = hashi.get("totals") or {}
    if not isinstance(totals, dict):
        raise SystemExit("Hashi stats missing totals object.")

    cards_studied = int(totals.get("cards_studied") or 0)
    tr = float(totals.get("true_retention") or 0.0) * 100.0
    tr_revlog_last = float(totals.get("true_retention_revlog_lastIvl") or 0.0) * 100.0
    tr_revlog_ivl = float(totals.get("true_retention_revlog_ivl") or 0.0) * 100.0
    tr_reviewlike = float(totals.get("true_retention_reviewlike") or 0.0) * 100.0

    print("APL (latest entry)")
    print(f"  totalCardsStudied: {int(apl_total)}")
    print(f"  retention:         {float(apl_ret):.2f}%")
    print()
    print("Hashi (totals)")
    print(f"  cards_studied:     {cards_studied}")
    if "true_retention_revlog_lastIvl" in totals or "reviews_revlog_lastIvl" in totals:
        print(f"  true_retention:    {tr:.2f}%  (review only, cards.ivl maturity)")
        print(f"  true_retention_revlog_lastIvl:{tr_revlog_last:.2f}%  (review only, revlog.lastIvl maturity)")
    else:
        print(f"  true_retention:    {tr:.2f}%  (review only, revlog.lastIvl maturity)")
    if "true_retention_revlog_ivl" in totals or "reviews_revlog_ivl" in totals:
        print(f"  true_retention_revlog_ivl:{tr_revlog_ivl:.2f}%  (review only, revlog.ivl maturity)")
    if "true_retention_reviewlike" in totals:
        print(f"  true_retention_reviewlike:{tr_reviewlike:.2f}%  (types 1+3, lastIvl maturity)")
    print()
    print("Differences (APL - Hashi)")
    print(f"  totalCardsStudied delta: {int(apl_total) - cards_studied}")
    print(f"  retention delta:         {float(apl_ret) - tr:.2f}%")

    return 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main(sys.argv))
