[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/wahanex2/token-radar-entry/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/wahanex2/token-radar-entry/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

A token launch radar: it reads a sealed DefiLlama snapshot and ranks every
pre-token protocol by an implied value derived from the snapshot's own
figures — TVL, seven-day growth, and time running with no token — then serves
the ranking as a filterable, sortable dashboard with a model breakdown and a
concrete farm plan for every row.

## How it runs

```
node main.ts --input <snapshot.json|directory> --output <directory>
```

With no arguments it reads `/input/snapshot.json` and writes to `/output`
(the grader's layout). `MAKEFUN_OUTPUT_DIR` stands in for `/output` when
`--output` is not given. Node 22+, standard library only, no network. The
program writes:

- `board.json` — the ranked board (every watchlist slug, plus every other
  rankable pre-token protocol), each row carrying its implied value, its
  model breakdown, and a seven-step farm plan with costs and durations.
- `data.js` — the same board, the live-token set, and the model constants,
  as `window.RADAR`, for the dashboard.
- `dashboard/` — a static page (search, category and chain filters,
  watchlist toggle, sortable columns, pre-token/live tabs, detail views, and
  a model sandbox that re-scores the board live).
- `screenshots/` — renders of the shipped dashboard.
- `dossier.json` — built last with the vendored make.fun board library.

The run is deterministic: the same snapshot bytes always write the same
output bytes.

## The value model

One function scores every row. The base multiple is calibrated at run time:
the median market-cap-to-TVL ratio of the live-token protocols in the
snapshot (CEX excluded, clamped to 0.05–1.0). Growth is clamped to −50%…+150%
and weighted at 0.5; maturity saturates over a year, so a long run with no
token says most of what age can say. The full formula, the calibration
sample size, and the exclusion rule are written out on the dashboard's model
panel and in `lib/model.ts`. No protocol name is special-cased; the
watchlist is covered in full because the board includes every rankable
pre-token protocol, and watchlist slugs are forced in regardless.

## Layout

```
main.ts                  entrypoint: read, score, write, copy, dossier
lib/model.ts             snapshot parsing, the model, the board, farm plans
dashboard/               index.html, app.css, app.js (no network)
vendor/makefun-board.ts  the kit's dossier library, copied unchanged
screenshots/             renders of the shipped dashboard
```

## License

MIT — see `LICENSE`.
