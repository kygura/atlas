# Atlas agent notes

This repository is the TypeScript/Bun implementation of Atlas. Ignore old Python-oriented plans or prompts if they disagree with the code.

## Runtime split

- The Claude Routine runs against this repo in Anthropic's cloud environment.
- `api/trigger.ts` is only a stateless webhook forwarder that passes inbound text to the routine `/fire` endpoint.
- All travel search, annotation, formatting, and dataset logic lives in `src/`.

## Commands

- `bun run normalize` → reads `tmp/raw_results.json`, writes `tmp/flight_results.json`
- `bun run annotate` → reads normalized flights + `tmp/annotations.json`, scores results, writes/commits `data/*.json`, writes `tmp/scored_results.json`
- `bun run format` → reads `tmp/scored_results.json`, writes `tmp/itinerary.txt`
- `bun test`
- `bun run typecheck`

## File contract

- `tmp/inbound_query.txt` stores inbound query text for query mode
- `tmp/raw_results.json` stores raw MCP/tool output
- `tmp/flight_results.json` stores normalized `FlightResult[]`
- `tmp/annotations.json` stores `LLMAnnotation[]`
- `tmp/scored_results.json` stores scored results
- `tmp/itinerary.txt` stores the final Telegram-ready itinerary

## Operating rules

- This repo uses native Claude tools/connectors for external services; do not add custom API clients for Kiwi, lastminute, Telegram, Notion, or Calendar.
- Treat non-empty routine text as query mode; otherwise run scheduled scan mode.
- Keep `booking_url` for ranked results whenever available.
- Distorted results belong in the committed dataset but must be excluded from ranked itinerary output.
- Only the annotate step should write and commit new files in `data/`.
- If you change code in this repo, run `bun test` and `bun run typecheck` before finishing.
