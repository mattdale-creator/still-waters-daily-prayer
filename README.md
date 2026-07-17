# Still Waters · Daily Prayer

A quiet, self-contained daily prayer web app for Christians. No build step, no
dependencies, no network calls, no accounts — open `index.html` from any static
server (or double-click it) and pray.

## What's inside

- **Today** — a themed verse of the day, a morning and an evening prayer, and a
  journaling reflection question. Content follows a 31-day cycle keyed to the
  day of the month.
- **Pray** — a guided ~5-minute session: stillness → opening → today's
  scripture → Adoration, Confession, Thanksgiving, Supplication (ACTS) → the
  Lord's Prayer → a scriptural blessing. Prompts rotate daily (deterministic,
  seeded by the date). Completing a session builds your prayer streak.
- **Prayers** — a library of classic public-domain prayers, creeds, and psalms,
  filterable by category, with copy buttons.
- **Sharing** — every prayer and verse has a Share button opening a share
  sheet: the device's native share (where supported) plus X, Facebook,
  WhatsApp, Telegram, Threads, Reddit, and Email. Pure URL share intents —
  no SDKs, no trackers, nothing loaded from the platforms.
- **Journal** — a personal prayer list (with "answered" tracking) and a daily
  journal. Everything is stored in `localStorage` only; the settings dialog can
  export it all as JSON or clear it.

Scripture quotations are from the **World English Bible (WEB)**, which is in
the public domain. Classic prayers use traditional public-domain wording.

## Running

```sh
python3 -m http.server 8722 --directory daily-prayer
# then open http://localhost:8722
```

Or use the `daily-prayer` configuration in `.claude/launch.json`.

## Files

```
daily-prayer/
├── index.html      # single page, four views + settings dialog
├── css/styles.css  # parchment/candlelight theme, dark mode, responsive
└── js/
    ├── data.js     # devotional corpus (31 days, library, guided prompts)
    └── app.js      # all application logic (vanilla JS, IIFE, no deps)
```

