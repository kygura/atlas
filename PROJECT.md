# Atlas — Implementation Spec

**Project:** Atlas  
**Repo:** `kygura/atlas`  
**Version:** 5 (final)

---

## What Atlas Is

A scheduled and on-demand Claude agent that:

1. Searches flights using native MCP tools (Kiwi.com, lastminute.com)
2. Annotates results with LLM judgment (weather, crowds, distortion, intent match)
3. Scores and commits findings to the repo as a compounding dataset
4. Delivers a booking-ready itinerary to Telegram via Composio

The Python codebase handles what Claude cannot: normalization into typed
schemas, scoring arithmetic, and git commits. Claude handles everything
that touches external services — directly, via MCP tools, without custom
API clients.

---

## What Atlas Is Not

- Not a custom API client for Kiwi or lastminute — Claude calls those as native tools
- Not a messaging SDK — Composio handles Telegram dispatch as a native tool
- Not a Notion client — Notion reads/writes are native tool calls
- Not a web scraper or real-time price tracker
- Not a booking system — it produces booking links, humans click them

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  TRIGGER                                            │
│  Schedule (Monday 09:00 GMT+2) → SCAN MODE         │
│  API call with query text      → QUERY MODE        │
│  GitHub push to config/        → SCAN MODE         │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  CLAUDE (MCP tools: Kiwi, lastminute, Calendar,    │
│          Notion, web_search, Composio)              │
│                                                     │
│  Resolves origin → searches flights → annotates    │
│  → calls Python scripts → formats → delivers       │
└────────────────────┬────────────────────────────────┘
                     │ calls scripts with file I/O
                     ▼
┌─────────────────────────────────────────────────────┐
│  PYTHON (repo code)                                 │
│  normalize.py  — raw MCP output → typed schemas    │
│  annotate.py   — annotations + flights → scored,   │
│                  committed to data/                 │
│  format.py     — scored results → itinerary text   │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  OUTPUT                                             │
│  data/YYYY-MM-DD-{mode}.json  committed to repo    │
│  Itinerary → Composio → Telegram                   │
│  Notion backup (non-blocking, if configured)       │
└─────────────────────────────────────────────────────┘
```

---

## Repo Structure

```
kygura/atlas/
├── README.md
├── pyproject.toml              # pydantic, gitpython — nothing else
├── vercel.json                 # tells Vercel to deploy api/ only
├── .env.example
├── .gitignore                  # tmp/, .env
│
├── atlas/                      # Python pipeline — runs in Routine's cloud VM
│   ├── ingestion/
│   │   └── schemas.py          # Pydantic models (see Section: Data Schema)
│   │
│   ├── context/
│   │   └── history.py          # Reads data/*.json → baseline medians per route
│   │
│   ├── scoring/
│   │   └── engine.py           # Pure scoring function — no I/O
│   │
│   └── cli/
│       ├── normalize.py        # tmp/raw_results.json → tmp/flight_results.json
│       ├── annotate.py         # tmp/annotations.json + flight_results.json
│       │                       #   → score → commit data/ → tmp/scored_results.json
│       └── format.py           # tmp/scored_results.json → tmp/itinerary.txt
│
├── api/                        # Vercel serverless — runs on Vercel's edge
│   └── trigger.js              # Telegram webhook → calls Routine /fire endpoint
│
├── config/
│   ├── scoring_weights.json
│   ├── wishlist.json
│   └── hard_filters.json
│
├── data/                       # Committed ScanRecords — the dataset
│   └── .gitkeep
│
├── tmp/                        # Ephemeral session handoff files (gitignored)
│   └── .gitkeep
│
└── .github/
    └── workflows/
        └── scan.yml            # Disabled by default — Target B migration path
```

**Two distinct runtimes, one repo:**
- `atlas/` runs inside Anthropic's cloud VM when the Routine fires
- `api/` deploys to Vercel's edge from the same repo push

**Python dependencies: pydantic, gitpython only.**
No HTTP clients. No third-party SDKs. No messaging libraries.
Everything external goes through Claude's native MCP tools.

`vercel.json`:
```json
{
  "functions": {
    "api/trigger.js": { "runtime": "nodejs20.x" }
  }
}
```
Scopes Vercel deployment to `api/` only — the Python pipeline is invisible to it.

---

## Data Schema

```python
# atlas/ingestion/schemas.py

from pydantic import BaseModel
from datetime import date
from typing import Optional

class FlightResult(BaseModel):
    flight_id: str                    # "{origin}-{dest}-{window_start}"
    source: str                       # "kiwi" | "lastminute"
    origin: str                       # IATA
    destination: str                  # IATA
    destination_name: str
    travel_window_start: date
    travel_window_end: date
    days_out: int                     # snapshot to departure
    price_economy_eur: Optional[float]
    price_business_eur: Optional[float]
    stops: int
    best_layover: Optional[str]       # IATA
    travel_time_hours: float
    booking_url: Optional[str]        # deep link to pre-filled checkout
    snapshot_date: date
    search_error: Optional[str]       # non-null if search failed

class LLMAnnotation(BaseModel):
    flight_id: str
    weather_score: int                # 1–5
    crowd_level: str                  # low | medium | high | peak
    notable_events: list[str]
    distortion_flag: bool
    distortion_reason: Optional[str]
    surf_quality: Optional[int]       # 1–5 | null if not applicable
    isolation_score: int              # 1–5
    personal_flag: str                # one sentence
    raw_reasoning: str

class ScoredResult(BaseModel):
    flight: FlightResult
    annotation: LLMAnnotation
    price_vs_baseline_pct: Optional[float]  # null if < 3 historical records
    composite_score: float                  # 0–10
    opportunity_flag: bool
    opportunity_reason: Optional[str]

class ScanRecord(BaseModel):
    scan_date: date
    run_mode: str                     # "scheduled" | "query"
    origin_resolved: str
    query: Optional[str]              # null for scheduled runs
    results: list[ScoredResult]       # all results including distorted
    itinerary_delivered: bool
    itinerary_text: str               # the text sent to Telegram
```

---

## Config Files

### `config/wishlist.json`
```json
[
  {
    "destination": "Lombok",
    "iata": "LOP",
    "status": "active",
    "intent_tags": ["surf", "isolation", "warm-water"],
    "avoid_periods": ["Jul 15 – Aug 31"],
    "notes": "Prefer Selong Belanak or Desert Point area. Avoid Nyepi."
  },
  {
    "destination": "Palawan",
    "iata": "PPS",
    "status": "active",
    "intent_tags": ["maritime", "remote", "island-hopping"],
    "notes": "Coron or El Nido. Avoid Mar–Apr (hottest)."
  }
]
```

### `config/hard_filters.json`
```json
{
  "max_stops": 2,
  "max_travel_time_hours": 22,
  "budget_economy_eur": { "min": 300, "max": 1800 },
  "fallback_origins": ["AGP", "MAD"],
  "lastminute_window_days": 21
}
```

### `config/scoring_weights.json`
```json
{
  "price_vs_baseline": 0.30,
  "weather_score":     0.25,
  "crowd_level":       0.25,
  "surf_quality":      0.15,
  "isolation_score":   0.05,
  "opportunity_threshold": 7.5
}
```

---

## CLI Scripts

### `atlas/cli/normalize.py`
Reads `tmp/raw_results.json` (Claude's raw MCP output).
Normalizes to `list[FlightResult]`.
Writes `tmp/flight_results.json`.
Applies hard filters — discards non-passing results, logs failures.
Deduplicates Kiwi vs lastminute results for the same route and window.

```python
# Entry point
if __name__ == "__main__":
    raw = json.loads(Path("tmp/raw_results.json").read_text())
    filters = json.loads(Path("config/hard_filters.json").read_text())
    results = normalize_and_filter(raw, filters)
    Path("tmp/flight_results.json").write_text(
        json.dumps([r.model_dump(mode="json") for r in results], indent=2)
    )
    print(f"Normalized {len(results)} results.")
```

### `atlas/cli/annotate.py`
Reads `tmp/flight_results.json` + `tmp/annotations.json`.
Loads baselines from `data/` via `history.py`.
Scores all results via `engine.py`.
Writes and git-commits `data/YYYY-MM-DD-{mode}.json`.
Writes `tmp/scored_results.json`.

```python
if __name__ == "__main__":
    flights = [FlightResult(**r) for r in
               json.loads(Path("tmp/flight_results.json").read_text())]
    annotations = [LLMAnnotation(**a) for a in
                   json.loads(Path("tmp/annotations.json").read_text())]
    weights = json.loads(Path("config/scoring_weights.json").read_text())
    baselines = get_baselines()   # reads data/, returns {} if empty
    scored = score_all(flights, annotations, baselines, weights)
    record = ScanRecord(...)
    commit_scan(record)           # gitpython: write + stage + commit data/
    Path("tmp/scored_results.json").write_text(
        json.dumps([r.model_dump(mode="json") for r in scored], indent=2)
    )
    print(f"Scored {len(scored)} results. Committed to data/.")
```

### `atlas/cli/format.py`
Reads `tmp/scored_results.json`.
Produces the itinerary text.
Writes `tmp/itinerary.txt`.
Does not send — Claude reads the file and sends via Composio.

---

## Scoring Logic

```python
# atlas/scoring/engine.py

def score(
    flight: FlightResult,
    annotation: LLMAnnotation,
    baseline_median: Optional[float],
    weights: dict,
    intent_tags: list[str]
) -> tuple[float, bool, Optional[str]]:

    # Price subscore
    if baseline_median and flight.price_economy_eur:
        price_score = max(0, min(10,
            10 - (flight.price_economy_eur / baseline_median - 0.7) * 15
        ))
    else:
        budget_max = 1800  # fallback if no baseline
        price_score = max(0, 10 - (flight.price_economy_eur / budget_max) * 10)

    # Qualitative subscores (1–5 → 0–10)
    weather   = (annotation.weather_score - 1) * 2.5
    crowd_map = {"low": 10, "medium": 6, "high": 3, "peak": 1}
    crowd     = crowd_map.get(annotation.crowd_level, 5)
    surf      = ((annotation.surf_quality or 3) - 1) * 2.5 \
                if "surf" in intent_tags else 5.0
    isolation = (annotation.isolation_score - 1) * 2.5

    composite = (
        price_score  * weights["price_vs_baseline"] +
        weather      * weights["weather_score"] +
        crowd        * weights["crowd_level"] +
        surf         * weights["surf_quality"] +
        isolation    * weights["isolation_score"]
    )

    opportunity = (
        composite >= weights["opportunity_threshold"] and
        baseline_median is not None and
        flight.price_economy_eur is not None and
        flight.price_economy_eur < baseline_median * 0.85
    )

    reason = (
        f"€{flight.price_economy_eur:.0f} vs €{baseline_median:.0f} median "
        f"({((baseline_median - flight.price_economy_eur) / baseline_median * 100):.0f}% below)"
        if opportunity else None
    )

    return composite, opportunity, reason
```

---

## Routine Prompt

```
You are Atlas. You run as a continuous Claude Code session on kygura/atlas.

Your job is to search flights using your native MCP tools, annotate the results,
call Python scripts to score and persist the data, format an itinerary, and
deliver it to Telegram via Composio.

You have native access to: Kiwi.com, lastminute.com, Google Calendar, Notion,
web_search, Composio. Use them directly — never write code to call them.

The Python scripts in this repo handle normalization, scoring, and git commits.
You call them. They do not call you.

════════════════════════════════
DETERMINE MODE
════════════════════════════════

Read the session text field.
- Contains a travel query → QUERY MODE. Write it to tmp/inbound_query.txt.
- Empty → SCAN MODE.

════════════════════════════════
SCAN MODE
════════════════════════════════

Step 1 — Resolve origin
Use Google Calendar to check for location signals in the next 14 days
(flight bookings, hotel confirmations, "location:" events).
If no signal: use fallback_origins from config/hard_filters.json.
State which origin you resolved and why.

Step 2 — Load wishlist
Read config/wishlist.json. Filter status = "active".
If NOTION_WISHLIST_DB_ID is set, query Notion for additional notes
and merge them into the wishlist. Non-blocking if Notion is unavailable.

Step 3 — Search flights
For each active destination:

  a. Use Kiwi.com to search from resolved origin for:
     - Window A: cheapest available 2–4 weeks from today
     - Window B: cheapest available 6–10 weeks from today

  b. For Window A only: also search lastminute.com.
     Lastminute surfaces short-notice deals Kiwi misses.
     If both return results for the same route and window, keep the cheaper one.

  c. For every result: extract booking_url (direct checkout link, not search page).

  d. Apply hard filters from config/hard_filters.json.
     Discard failing results. Note each failure explicitly — do not skip silently.

Step 4 — Write raw results
Write all raw search results (including failures) to tmp/raw_results.json.
Structure: array of objects, one per search attempt, preserving source fields.

Step 5 — Normalize
  python -m atlas.cli.normalize
Read tmp/flight_results.json to confirm shape and count.

Step 6 — Annotate
For each FlightResult in tmp/flight_results.json, use web_search to assess
actual conditions for that destination during its specific travel window.
Do not use generic season descriptions — check actual forecasts and events.

Produce one LLMAnnotation per record:

  flight_id         string   — copy exactly from input
  weather_score     int      — 1 (poor) to 5 (excellent) for that window
  crowd_level       string   — low | medium | high | peak
  notable_events    array    — festivals, holidays, strikes, conferences
  distortion_flag   bool     — true if price or crowd is driven by a
                               known one-off event, not structural seasonality
  distortion_reason string   — required if distortion_flag true, else null
  surf_quality      int|null — 1–5 if destination tagged "surf", else null
  isolation_score   int      — 1 (busy) to 5 (extremely remote)
  personal_flag     string   — one sentence: what makes this notable, or "No signal."
  raw_reasoning     string   — your full chain of thought

DISTORTION RULE: a spike caused by a conference, regatta, school break, or
national holiday is a distortion. Flag it. Distorted records are committed
to data/ but excluded from the ranked itinerary.

Write a valid JSON array to tmp/annotations.json. No preamble. Valid JSON only.

Step 7 — Score and commit
  python -m atlas.cli.annotate
Reads tmp/flight_results.json + tmp/annotations.json.
Scores all results. Commits ScanRecord to data/. Writes tmp/scored_results.json.
Read the script output. If exit non-zero: read stderr, report, stop.

Step 8 — Format
  python -m atlas.cli.format
Writes tmp/itinerary.txt. Read it. Verify it matches the format below.

Step 9 — Deliver
Use Composio to send the content of tmp/itinerary.txt to Telegram
chat ID: $ATLAS_TELEGRAM_CHAT_ID.
Confirm delivery.

If NOTION_BACKUP_DB_ID is set: write a backup entry to Notion. Non-blocking.

════════════════════════════════
QUERY MODE
════════════════════════════════

Step 1 — Parse tmp/inbound_query.txt. Extract:
  - Origin: explicit > Calendar signal > fallback_origins
  - Destination or intent: explicit destination or tags → match against wishlist
  - Timeframe: explicit or relative ("next month", "in 3 weeks")
  - Budget: explicit or hard_filters.json default
  - Trip length: explicit or default (21 days)
  State what you resolved and what you defaulted.

Steps 2–9: identical to SCAN MODE, with these differences:
  - Search only for the resolved query parameters, not the full wishlist
  - In Step 8: personalize the itinerary to the stated intent
  - Note in the itinerary if any parameter was defaulted

════════════════════════════════
ITINERARY FORMAT
════════════════════════════════

atlas.cli.format produces this. Read tmp/itinerary.txt and verify it matches.

  ATLAS — [date] · from [origin]

  #1 [Destination Name] via [Layover]
  ✈ €[price] · [stops] stop(s) · [hours]h · Book → [booking_url]
  📅 [window_start] – [window_end] ([n] days)
  🌤 Weather: [score]/5 — [one descriptive phrase]
  👥 Crowds: [level]
  💡 [personal_flag][. [price_vs_baseline string if baseline exists]]

  [up to 5 results, non-distorted only, descending by composite_score]
  [opportunity_flag results marked with ⚡]

  Dataset: [n] records across [m] routes · Updated [date]

Rules for the itinerary:
- First run: omit baseline comparison. End dataset line with "· First scan."
- booking_url null: write "Book → [search results](url)" linking to search page
- All results distorted or filtered: state clearly, do not fabricate alternatives
- Thin history (< 3 records for a route): note it inline, do not estimate baseline

════════════════════════════════
RULES
════════════════════════════════

- Use MCP tools directly. Never write code to call external services.
- All git commits go through atlas.cli.annotate exclusively.
- Never fabricate a baseline or an itinerary option.
- booking_url is mandatory in every ranked result.
- Any script exits non-zero: read stderr, report the error, stop.
- Distorted records: committed to data/, excluded from rankings and the itinerary.
- Do not commit anything except through atlas.cli.annotate.
```

---

## Trigger Configuration

### Schedule — SCAN MODE
Monday 09:00 GMT+2. Scans full wishlist. Delivers itinerary to Telegram.
No text field — Claude detects empty and runs SCAN MODE.

### API Trigger — QUERY MODE
Text field contains the user's query. Claude detects it and runs QUERY MODE.
Called by the Vercel webhook receiver after an inbound Telegram message.

```bash
curl -X POST https://api.anthropic.com/v1/claude_code/routines/$ROUTINE_ID/fire \
  -H "Authorization: Bearer $ROUTINE_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: experimental-cc-routine-2026-04-01" \
  -H "Content-Type: application/json" \
  -d '{"text": "surf and isolation, 3 weeks, under €1200, flexible origin"}'
```

### GitHub Push Trigger
Filter: `config/wishlist.json` or `config/scoring_weights.json`.
Runs SCAN MODE immediately after a config update.

### Vercel Webhook — `api/trigger.js`
Lives in the repo. Deployed automatically by Vercel on every push to main.
Receives Telegram webhook POSTs → extracts message text → calls `/fire`.
Stateless. No business logic. Responds immediately with `200 OK` so Telegram
doesn't retry.

```javascript
// api/trigger.js
export default async function handler(req, res) {
  const text = req.body?.message?.text || req.body?.text || ""
  if (!text) return res.json({ ok: true })

  await fetch(process.env.ROUTINE_FIRE_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.ROUTINE_TOKEN}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  })

  res.json({ ok: true })
}
```

Telegram is told to POST to `https://your-vercel-url.vercel.app/api/trigger`.
Any other interface (WhatsApp, custom frontend, another bot) that can make
an HTTP POST sends to the same URL. `api/trigger.js` is the universal
inbound entry point regardless of interface.

---

## Environment Variables

```
# Routine cloud environment
ATLAS_TELEGRAM_CHAT_ID=       # Telegram chat_id for itinerary delivery
FALLBACK_ORIGINS=AGP,MAD      # comma-separated IATA codes

# Optional — Notion
NOTION_WISHLIST_DB_ID=        # read additional wishlist context
NOTION_BACKUP_DB_ID=          # write scan backups

# Vercel only
ROUTINE_FIRE_URL=             # full /fire endpoint URL
ROUTINE_TOKEN=                # per-routine bearer token (store immediately)
```

No Anthropic API key needed in the Routine environment — Claude uses session auth.
API key required only for Target B (GitHub Actions) and Target C (self-hosted).

---

## Deployment Portability

Atlas launches on the Claude Routine. The migration path to independence is
preserved but not built until there is a concrete reason to migrate.

### Target B — GitHub Actions (future)
Uncomment `.github/workflows/scan.yml`. Add secrets. Done.
Requires: Custom MCP connectors and scrapper.
`atlas/llm/client.py` stub documents the annotation/ranking prompt contracts
for when the LLM call moves from agent-native to SDK call.

### Target C — Self-hosted (future)
Docker container. FastAPI + APScheduler. Same orchestration logic.
Same requirement: API clients for flight search.

Migration cost today: low. The data layer (`data/`), the scoring logic,
and the schema contracts are fully portable. Only the I/O layer changes.

---

## Build Sequence

One session. Each checkpoint is a working, testable state.

**Checkpoint 0 — Scaffold**
```
git init kygura/atlas
```
- `pyproject.toml`: `pydantic`, `gitpython`
- Module skeleton with empty `__init__.py` files
- `config/wishlist.json` — 3 destinations to start
- `config/scoring_weights.json`, `config/hard_filters.json`
- `data/.gitkeep`, `tmp/.gitkeep`
- `.gitignore`: `tmp/`, `.env`
- `atlas/ingestion/schemas.py` — full Pydantic models
- `api/trigger.js` — webhook forwarder (see Trigger Configuration)
- `vercel.json` — scopes Vercel to `api/` only
- `.github/workflows/scan.yml` — committed, schedule line commented out
- Commit: `atlas: initial scaffold`

**Checkpoint 1 — Scoring and persistence**
- `atlas/scoring/engine.py` — implement `score()`, write unit tests
- `atlas/context/history.py` — reads `data/*.json`, returns `{}` if empty
- `atlas/persistence/repo.py` — `commit_scan()` using gitpython
- `atlas/cli/annotate.py` — full implementation
- Test: write mock `tmp/flight_results.json` + `tmp/annotations.json`,
  run `python -m atlas.cli.annotate`, verify commit appears in `git log`
- ✓ Data layer works end-to-end without Claude

**Checkpoint 2 — Normalize and format**
- `atlas/cli/normalize.py` — raw JSON → FlightResult array with dedup
  and hard filter application
- `atlas/cli/format.py` — ScoredResult array → itinerary text
- Test normalize: write mock raw_results.json, run, inspect flight_results.json
- Test format: write mock scored_results.json, run, inspect itinerary.txt
- ✓ Full script chain works with mock data

**Checkpoint 3 — Routine wired up**
- Create routine in Claude web UI:
  - Name: Travel Agent
  - Repo: kygura/atlas
  - Paste prompt from above
  - Schedule: Monday 09:00 GMT+2
  - API trigger: enable, copy token immediately to password manager
  - Connectors: Kiwi.com ✓, lastminute.com ✓, Notion ✓,
    Google Calendar ✓, Composio ✓. Remove Gmail.
  - Environment variables: ATLAS_TELEGRAM_CHAT_ID, FALLBACK_ORIGINS
- Hit Run now
- Watch session at claude.ai/code
- ✓ Itinerary arrives in Telegram. ScanRecord committed to data/.

**Checkpoint 4 — Vercel webhook **
- Connect `kygura/atlas` to a Vercel project (import from GitHub)
- Add `ROUTINE_FIRE_URL` and `ROUTINE_TOKEN` as Vercel environment variables
- Vercel auto-deploys `api/trigger.js` — no separate project, no separate config
- Register the Vercel URL as the Telegram bot webhook:
  ```bash
  curl "https://api.telegram.org/bot$BOT_TOKEN/setWebhook" \
    -d "url=https://your-project.vercel.app/api/trigger"
  ```
- Test: send a message from Telegram → Routine fires → itinerary reply arrives
- ✓ Full bidirectional Telegram loop working from one repo

**Checkpoint 5 — Notion integration (optional)**
- Add NOTION_WISHLIST_DB_ID and NOTION_BACKUP_DB_ID to routine env
- Test: run, confirm backup in Notion, confirm system works without
  credentials present (non-blocking)
- ✓ Notion reads and writes, silently skipped if down

---

## What Compounds

Every run appends a `ScanRecord` to `data/`. After several weeks:

- `history.py` returns meaningful baselines → `price_vs_baseline_pct` appears
- `opportunity_flag` starts distinguishing genuine deals from noise
- The dataset is versioned, diffable, distortion-cleaned, and specific to
  your origins, destinations, and intent tags

No vendor sells this dataset. It is the asset.
The pipeline is the means. The itinerary is the immediate return.
The dataset is the compounding one.
