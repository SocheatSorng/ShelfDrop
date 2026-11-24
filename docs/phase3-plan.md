# Phase 3 plan: hardening

Goal: safe to leave running. "✓ sent <date>" marks, token rotation steps, the daily send cap, safe
error messages, a security review. Branch `phase-3-hardening`, version 0.3.0. Spec:
[spec.md](spec.md), phase 3 row.

## Decisions made (2026-11-24)

1. **Time zone: Asia/Phnom_Penh** (UTC+7, no daylight saving) for the sent date and for the daily
   limit's day. The limit now resets at midnight in Cambodia, not at 07:00.
2. **Sent mark:** on every book row (series pages and loose books on the shelf) and on the confirm
   page. It shows the **last** send; sending again updates it. **No clearing.**
3. **Daily cap: keep 15** books a day.
4. **Token rotation: guide steps only**, no new code.

## Design

- **Where the mark comes from:** `_sent:<fileId>` in Script Properties already holds the last send
  time (ms) for the 10-minute cooldown. The mark reuses it: no new storage. Every request already
  reads all Script Properties once (`readSettings`), so the marks cost no extra call.
- **Never from the cache:** listings stay cached for 30 minutes, but marks are read fresh on every
  page, so a book sent a minute ago shows its mark at once.
- **Format:** `✓ sent 24 Nov` (this year) or `✓ sent 24 Nov 2025` (other years), in Cambodia time.
  The tick is `&#10003;`, which the Kindle's Chromium 80 and Georgia both show.
- **Size:** each mark is about 55 bytes. Script Properties hold 500 KB, so about 9,000 sent books
  before trouble. Not a concern for one reader; noted, not built for.
- **Local day:** a pure `localDay(now)` (UTC+7 offset) replaces the UTC day in the daily count key.
  The manifest's `timeZone` becomes `Asia/Phnom_Penh` so log times match.
- **A bad value** in a `_sent:` key (not a number) shows no mark and does not break the page.

## Safe error messages (audit)

Every page a visitor with the token can see must hold no Kindle address, no token outside links and
the send form, no folder ID, and no Google error text. Checked by tests that render each page with
fake secrets: not-found, setup needed, not on the shelf, can't send, not sent (each limit reason),
mail failure, something went wrong. Logs keep redacting the address and token (phase 1).

## Tasks (thin slices, each: tests → code → lint → commit)

1. **Version and plan.** This file, version 0.3.0.
2. **Local day (pure, `src/limits.js`).** `localDay(now)` in UTC+7; the daily count uses it; the
   manifest time zone. Tests: 16:59 UTC and 17:00 UTC fall on different Cambodia days; the cap
   starts again at Cambodia midnight.
3. **Sent marks (pure).** `sentAt(props, fileId)` and `formatSentDate(ms, now)`. Tests: no mark, a
   bad value, this year, another year, the day boundary in Cambodia.
4. **Marks on the pages (`src/pages.js`, `src/Code.js`).** Book rows and the confirm page; the
   values come from the request's properties, never the cache. Tests: a sent book shows its mark,
   a cached listing still shows a fresh mark, a re-send updates it.
5. **Safe-messages audit tests**, fixing anything they find.

   **Checkpoint A:** lint + tests green.

6. **UI pass** with `kindle-ui-designer` on the series page with marks (618 x 647, fake books).
7. **Security review** (`agent-skills:security-auditor`) of the phase. Fix must-fix items with tests.
8. **Owner's guide `docs/setup-phase3.md`:** deploy, the tests below, the token rotation recipe,
   and the standing rules (N11: never give anyone edit access to the shelf folders; N13: every
   account in `FOLDER_ID` is fully trusted; keep the ShelfDrop account dedicated).

   **Checkpoint B:** lint + tests + audit green; review items fixed; guide ready.

9. **Owner tests on the Kindle**; results here and in `docs/spec.md`. Merge to `main` with
   `--ff-only` only on the owner's yes, then re-run lint and tests on `main`.

## The owner's tests (preview)

| #   | Test                                       | Pass when                                                 |
| --- | ------------------------------------------ | --------------------------------------------------------- |
| T1  | Send a book, go back to its series         | Its row says "✓ sent <today>"; the confirm page says so   |
| T2  | Send the same book again within 10 minutes | "Not sent", and the mark stays                            |
| T3  | Rotate the token (guide recipe)            | Old bookmark shows "Not found"; the new link works        |
| T4  | checkSetup                                 | Logs counts and names only; no address, token or file IDs |

## UI pass (2026-11-24)

`kindle-ui-designer` at 618 x 647 (also 150% text, dark, greyscale) with fake books. The mark is
**bold** and kept on one line (`white-space:nowrap`), upright on italic "too big" rows; the size
("3.4 MB") no longer splits across lines. Inline, not on its own line, to keep rows short. Georgia
has no ✓; the browser takes it from another font. The owner checks it on the Kindle (T1); if it is
a box, swap the glyph or drop it.

## Security review (2026-11-24)

`security-auditor`, read-only, over `main..phase-3-hardening`. No must-fix items; the marks are
built only after the token check and kept in a `Map`. Fixed, each with tests:

- **SF-1:** a huge `_sent:` value (`1e300`) made `toISOString` throw and broke the page; times
  after the year 9000 are skipped.
- **SF-2:** with Script Properties full, the new `_sent:` key failed after the mail went, so the
  daily count was never written and the cap failed open. The count is written first; a failed mark
  is noted in `_lastError` and the reader still sees "Sent". `checkSetup` logs how full Script
  Properties are and warns above 400 KB.
- **SF-3:** the leak sweep now also covers the shelf, series, confirm and Sent pages with marks, and
  every tab title; the setup-needed case holds a Kindle address.

Accepted, in the guide: **N-1** deploying before 07:00 Cambodia time resets the day's count once
(deploy after 07:00); **N-2** a leaked link also shows which books were sent (another reason to
change the token). Notes: **N-3** every page reads all properties (fine at this size); **N-4** a
future `_sent:` time skips the cooldown (pre-existing; the cap still holds).
