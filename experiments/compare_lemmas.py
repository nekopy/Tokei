from __future__ import annotations

import os
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path


def _user_root() -> Path:
    env_root = os.environ.get("TOKEI_USER_ROOT")
    if env_root and env_root.strip():
        return Path(env_root).expanduser().resolve()
    return Path(__file__).resolve().parents[1]


def _load_anki_profile(root: Path) -> str:
    cfg_path = root / "config.json"
    try:
        raw = cfg_path.read_text(encoding="utf-8")
    except Exception:
        return "User 1"
    try:
        import json

        parsed = json.loads(raw)
    except Exception:
        return "User 1"
    if not isinstance(parsed, dict):
        return "User 1"
    prof = parsed.get("anki_profile")
    return str(prof).strip() or "User 1"


def _open_sqlite_ro(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path}?mode=ro", uri=True)


def _table_exists(con: sqlite3.Connection, name: str) -> bool:
    row = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1", (name,)
    ).fetchone()
    return bool(row)


def _count_distinct(con: sqlite3.Connection, table: str, column: str) -> int:
    row = con.execute(f"SELECT COUNT(DISTINCT {column}) FROM {table}").fetchone()
    return int(row[0] or 0) if row else 0


def _norm_surface(value: str) -> str:
    s = str(value or "").strip()
    s = unicodedata.normalize("NFC", s)
    s = re.sub(r"\s+", " ", s)
    return s


def _csv_summary(csv_path: Path) -> tuple[int, int, int]:
    import csv

    rows = list(csv.reader(csv_path.open("r", encoding="utf-8-sig", newline="")))
    if not rows:
        return 0, 0, 0

    start_idx = 0
    first_raw = rows[0][0] if rows[0] else ""
    first = _norm_surface(first_raw)
    first_lc = first.lower()
    header_words = {"word", "words", "surface", "expression", "lexeme", "lemma", "lemmas"}
    if first_lc in header_words or (
        re.search(r"[a-z]", first_lc)
        and any(k in first_lc for k in ("word", "surface", "expression", "lexeme", "lemma", "morph"))
    ):
        start_idx = 1

    surfaces = []
    for row in rows[start_idx:]:
        s = _norm_surface(row[0] if row else "")
        if s:
            surfaces.append(s)

    return len(rows), len(surfaces), len(set(surfaces))


def main() -> int:
    root = _user_root()
    print("=== EXPERIMENT: Compare Lemma Counts (Read-Only) ===")
    print(f"User root: {root}")
    csv_candidates = [
        root / "data" / "known.csv",
        root / "data" / "csv" / "known.csv",
        root / "known.csv",
    ]
    csv_path = next((p for p in csv_candidates if p.exists()), None)
    if csv_path is None:
        print("CSV: (missing) expected one of:")
        for p in csv_candidates:
            print(f"  - {p}")
    else:
        try:
            n_lines, n_rows, n_unique = _csv_summary(csv_path)
            print(f"CSV: {csv_path} ({n_lines} lines, {n_rows} rows, {n_unique} unique surfaces)")
        except Exception:
            print(f"CSV: {csv_path}")
    print("")

    appdata = os.environ.get("APPDATA")
    if not appdata:
        print("WARN: APPDATA is not set; cannot locate AnkiMorphs DB.")
        appdata = None

    profile = _load_anki_profile(root)
    ankimorphs_db = (
        Path(appdata) / "Anki2" / profile / "ankimorphs.db" if appdata else None
    )
    tokei_words_db = root / "cache" / "tokei_words.sqlite"

    anki_lemma_count = None
    anki_surface_count = None
    if ankimorphs_db and ankimorphs_db.exists():
        con = _open_sqlite_ro(ankimorphs_db)
        try:
            if not _table_exists(con, "Morphs"):
                print(f"WARN: AnkiMorphs DB missing Morphs table: {ankimorphs_db}")
            else:
                anki_lemma_count = _count_distinct(con, "Morphs", "lemma")
                anki_surface_count = _count_distinct(con, "Morphs", "inflection")
        finally:
            con.close()
    else:
        print(f"WARN: AnkiMorphs DB not found; skipping: {ankimorphs_db}")

    tokei_lemma_count = None
    tokei_surface_count = None
    tokei_changed_surface_count = None
    tokei_collision_lemma_count = None
    tokei_changed_samples: list[tuple[str, str]] = []
    if tokei_words_db.exists():
        con = _open_sqlite_ro(tokei_words_db)
        try:
            if not _table_exists(con, "lexemes"):
                print("WARN: Tokei words DB is missing lexemes table; did Phase 1 sync run?")
            else:
                tokei_surface_count = _count_distinct(con, "lexemes", "normalized_surface")

            if not _table_exists(con, "lemmas"):
                print("WARN: Tokei words DB is missing lemmas table; did Phase 2 run?")
            else:
                tokei_lemma_count = _count_distinct(con, "lemmas", "lemma")
                if tokei_lemma_count == 0:
                    print("WARN: Tokei lemmas table is empty; spaCy lemmas may not have been generated yet.")

                if _table_exists(con, "lexeme_lemmas"):
                    row = con.execute(
                        """
                        SELECT COUNT(*)
                        FROM lexemes l
                        JOIN lexeme_lemmas ll ON ll.lexeme_id = l.id
                        JOIN lemmas le ON le.id = ll.lemma_id
                        WHERE l.normalized_surface != le.lemma
                        """
                    ).fetchone()
                    tokei_changed_surface_count = int(row[0] or 0) if row else 0

                    tokei_changed_samples = [
                        (str(a), str(b))
                        for (a, b) in con.execute(
                            """
                            SELECT DISTINCT l.normalized_surface, le.lemma
                            FROM lexemes l
                            JOIN lexeme_lemmas ll ON ll.lexeme_id = l.id
                            JOIN lemmas le ON le.id = ll.lemma_id
                            WHERE l.normalized_surface != le.lemma
                            ORDER BY l.normalized_surface
                            LIMIT 20
                            """
                        ).fetchall()
                    ]

                    row2 = con.execute(
                        """
                        SELECT COUNT(*)
                        FROM (
                          SELECT le.lemma
                          FROM lexemes l
                          JOIN lexeme_lemmas ll ON ll.lexeme_id = l.id
                          JOIN lemmas le ON le.id = ll.lemma_id
                          GROUP BY le.lemma
                          HAVING COUNT(DISTINCT l.normalized_surface) > 1
                        ) x
                        """
                    ).fetchone()
                    tokei_collision_lemma_count = int(row2[0] or 0) if row2 else 0
        finally:
            con.close()
    else:
        print(f"WARN: Tokei words DB not found; skipping: {tokei_words_db}")

    print("")
    print("AnkiMorphs")
    if anki_lemma_count is None:
        print("  lemmas:   (skipped)")
        print("  surfaces: (skipped)")
    else:
        print(f"  lemmas:   {anki_lemma_count}")
        print(f"  surfaces: {anki_surface_count}")

    print("")
    print("Tokei (spaCy-derived)")
    if tokei_lemma_count is None:
        print("  lemmas:   (skipped)")
        print("  surfaces: (skipped)")
    else:
        print(f"  lemmas:   {tokei_lemma_count}")
        print(f"  surfaces: {tokei_surface_count}")
        if tokei_changed_surface_count is not None:
            print(f"  surface!=lemma (rows): {tokei_changed_surface_count}")
            if tokei_changed_samples:
                print("  examples:")
                for a, b in tokei_changed_samples:
                    print(f"    - {a} -> {b}")
        if tokei_collision_lemma_count is not None:
            print(f"  lemmas with >1 surface: {tokei_collision_lemma_count}")

    if anki_lemma_count is not None and tokei_lemma_count is not None:
        diff = int(tokei_lemma_count) - int(anki_lemma_count)
        print("")
        print(f"Difference (Tokei - AnkiMorphs): {diff}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
