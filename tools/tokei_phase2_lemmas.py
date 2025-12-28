from __future__ import annotations

import sqlite3
import sys
import unicodedata
from pathlib import Path


def _normalize(text: str) -> str:
    s = str(text or "").strip()
    return unicodedata.normalize("NFC", s)


def _spacy_lemma_for_surface(nlp, surface: str) -> str:
    doc = nlp(surface)
    for tok in doc:
        if (
            getattr(tok, "is_space", False)
            or getattr(tok, "is_punct", False)
            or getattr(tok, "is_stop", False)
        ):
            continue
        lemma = _normalize(getattr(tok, "lemma_", "") or "")
        if lemma:
            return lemma
        break
    return _normalize(surface)


def _ensure_tables(con: sqlite3.Connection) -> None:
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS lemmas (
          id INTEGER PRIMARY KEY,
          lemma TEXT NOT NULL,
          reading TEXT,
          rule_id TEXT NOT NULL,
          UNIQUE (lemma, rule_id)
        )
        """
    )
    con.execute(
        """
        CREATE TABLE IF NOT EXISTS lexeme_lemmas (
          lexeme_id INTEGER NOT NULL,
          lemma_id INTEGER NOT NULL,
          PRIMARY KEY (lexeme_id, lemma_id)
        )
        """
    )


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("Usage: tokei_phase2_lemmas.py <words_db_path> [--rebuild]", file=sys.stderr)
        return 2

    words_db_path = Path(argv[1]).expanduser().resolve()
    rebuild = "--rebuild" in argv[2:]
    if not words_db_path.exists():
        print(f"Words DB not found: {words_db_path}", file=sys.stderr)
        return 2

    try:
        import spacy  # type: ignore
    except Exception as e:
        print(f"spaCy import failed: {type(e).__name__}", file=sys.stderr)
        return 3

    try:
        nlp = spacy.load("ja_core_news_md")
    except Exception as e:
        print(f"Failed to load model ja_core_news_md: {type(e).__name__}", file=sys.stderr)
        return 3

    con = sqlite3.connect(str(words_db_path))
    try:
        con.execute("PRAGMA journal_mode=DELETE;")
        con.execute("PRAGMA synchronous=NORMAL;")
        _ensure_tables(con)
        if rebuild:
            con.execute("DELETE FROM lexeme_lemmas;")
            con.execute("DELETE FROM lemmas;")
            rows = con.execute(
                "SELECT id, surface, rule_id FROM lexemes ORDER BY id"
            ).fetchall()
        else:
            rows = con.execute(
                """
                SELECT l.id, l.surface, l.rule_id
                FROM lexemes l
                LEFT JOIN lexeme_lemmas ll ON ll.lexeme_id = l.id
                WHERE ll.lexeme_id IS NULL
                ORDER BY l.id
                """
            ).fetchall()

        for lexeme_id, surface, rule_id in rows:
            lemma = _spacy_lemma_for_surface(nlp, str(surface))
            rid = str(rule_id)
            con.execute(
                "INSERT OR IGNORE INTO lemmas(lemma, reading, rule_id) VALUES(?, ?, ?)",
                (lemma, None, rid),
            )
            lemma_id = con.execute(
                "SELECT id FROM lemmas WHERE lemma=? AND rule_id=?",
                (lemma, rid),
            ).fetchone()[0]
            con.execute(
                "INSERT OR IGNORE INTO lexeme_lemmas(lexeme_id, lemma_id) VALUES(?, ?)",
                (int(lexeme_id), int(lemma_id)),
            )

        con.commit()
    finally:
        con.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
