# Tokei (APL-independent dashboard sync)

Tokei is a standalone sync + report generator that combines:

- **Toggl** (API token) for lifetime + today immersion (with description breakdown)
- **AnkiMorphs** (`ankimorphs.db`) for known lemma/inflection counts
- **Hashi** (`hashi_exports/anki_stats_snapshot.json`) for Anki retention + review totals
- **Mokuro** (`volume-data.json`) for manga characters read
- **GameSentenceMiner** (`gsm.db`) for GSM characters read

It caches merged snapshots into `Tokei/cache/tokei_cache.sqlite`, then renders:

- HTML: `Tokei/output/Tokei Report <report_no>.html`
- PNG: `Tokei/output/Tokei Report <report_no>.png`

## Setup

1) Put your Toggl token in `TOGGL_API_TOKEN`, create `Tokei/toggl-token.txt` (one line), **or** enter it during `Tokei/Setup-Tokei.bat`.
2) Run `Tokei/Setup-Tokei.bat` to set:
   - timezone (default `local`)
   - theme (defaults to `midnight`; preview samples in `design/output/`)
   - output folder (defaults to `Tokei/output/`)
   - `baseline_hours` (auto-calculated from your HH:MM:SS input, through yesterday)
   - Anki profile name (default `User 1`)
3) Run `Tokei/Tokei.bat`.

## Reset

- Run `Tokei/Reset-Tokei.bat` to delete `Tokei/cache/` + `Tokei/output/` and restore `Tokei/config.json` defaults (then re-run setup).

## Notes

- Timezone defaults to `America/Los_Angeles`, but is configurable.
- On Windows, if your Python install lacks IANA tzdata, set `timezone` to `local` (default) or install `tzdata` for IANA names.
- For fresh Anki stats, **Anki must be running**: `Tokei/Tokei.bat` triggers a Hashi export via `http://127.0.0.1:8766/export` before it reads `hashi_exports/anki_stats_snapshot.json`.
- Note: port `8765` is commonly used by AnkiConnect. Hashi defaults to `8766` to avoid conflicts.
- Toggl `/me/time_entries` may limit how far back it can query.
- Default behavior is to start from the day you first run Tokei (and then update incrementally).
- If you want to backfill more history, set `toggl.start_date` in `Tokei/config.json` to a real date (YYYY-MM-DD), subject to Toggl’s limits.
- `toggl.refresh_days_back`: max backfill window in days (default `60`). With adaptive refresh, Tokei usually fetches far fewer days unless you’ve been away.
- `toggl.refresh_buffer_days`: extra days added on top of the gap since your last run (so short gaps still refresh a few recent days; default `2`).
- `toggl.chunk_days`: how many days each Toggl API request covers (smaller = more requests but less likely to hit API range issues; default `7`).
- If Toggl limits your backfill window (e.g. ~3 months), set `toggl.baseline_hours` in `Tokei/config.json` to account for older lifetime time (similar to an offset). Tokei will compute `lifetime = baseline + cached_sum`.
- Baseline guidance: in Toggl Reports, set the end date to **yesterday** so you don't double-count today (Tokei fetches today separately).
- Mokuro manga chars: configure `mokuro.volume_data_path` (defaults to `D:\mokuro-reader\volume-data.json`).
- GSM chars: configure `gsm.db_path` to `auto` (default), a full path, or `off`.
- First run behavior:
  - By default, Tokei fetches **today only** into the cache (so it won’t double-count against your baseline).
  - If you set `toggl.start_date` to a real date, Tokei will backfill from that date (subject to Toggl's limits).
- Tokei does not depend on AutoProgressLog (APL) or `autoprogresslog/cache.json`.
- If any input files/DBs are missing, Tokei prints warnings and writes `Tokei/output/Tokei Report <n> WARNINGS.txt`.
