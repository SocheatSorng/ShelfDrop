# Phase 2 plan: the real shelf

Goal: the everyday flow on the owner's real bookshelf. Series → volumes, loose books, natural sort,
EPUB/PDF only, "too big" marks, clear error pages, and pages designed for the Kindle.
Branch `phase-2-shelf`, version 0.2.0. Spec: [spec.md](spec.md), phase 2 row.

## What phase 1 taught us (design inputs)

- Kindle browser: Chromium 80, JavaScript on, page area **618 x 647 CSS px**. Links with
  `target="_top"` and the POST form work.
- About **8 s per page change**. The script is only 0.5–2 s of that; the rest is Google's frame and
  the e-ink redraw. So caching can save about a second per page, and **the biggest saving is one page
  change fewer** on the way to a book.
- Errors from Google come in the account's language: decide from facts, never from error text.

## Pages and links

| Page          | Link                    | Shows                                                                    |
| ------------- | ----------------------- | ------------------------------------------------------------------------ |
| Shelf         | `?t=…`                  | Series (subfolders of the shelf) in natural order, then loose books      |
| Series        | `?t=…&s=<folderId>`     | The series' volumes in natural order, "too big" marks, back to the shelf |
| Confirm       | `?t=…&f=<fileId>`       | The book, a "Send to Kindle" button (POST), back to its series           |
| Sent / errors | POST, or a failed check | What happened, back to the series or the shelf                           |

- Only one level of subfolders. Folders inside a series are ignored (out of scope in the intent).
- A series ID from the URL is never trusted (review N6): `?s=` is served only if that folder's parent
  is the shelf, otherwise the page says "not on the shelf". The same answer as a folder that doesn't
  exist, so the page never confirms what else is in Drive.
- Send check: the file's parent is the shelf (a loose book) **or** its parent is a folder whose
  parent is the shelf (a volume). A file two levels down, or anywhere else, is refused.
- The confirm page's "back" goes to the file's real (checked) series, not to anything from the URL.
- The diag page and its link are removed (N4). Still no third-party resources (N3); all links use
  `WEB_APP_URL` (N5).

## Speed

- Measure first: the Apps Script **Executions** page shows each run's duration; the owner sends a
  screenshot before and after.
- Cache the shelf and each series' listing in `CacheService` (script cache, no extra OAuth scope),
  keyed by folder ID so a new `FOLDER_ID` starts fresh. The cache holds names, IDs and sizes, never
  the token or the Kindle address. The send check always reads Drive fresh, never the cache.
- A "Refresh" link on the shelf page reloads from Drive, for a book just added.
- Page weight stays tiny (inline CSS, no images, no scripts).

## Tasks (thin slices, each: tests → code → lint → commit)

1. **Clean up and bump.** Remove the diag page, `diagLink` and their tests; version 0.2.0.
   Done when no `diag` is left in `src/` and tests pass.
2. **Shelf model (pure, `src/shelf.js`).** `listShelf(folders, files)` → `{ series, loose }`,
   natural sort of folders and books, `checkSeries(folder, shelfId)`, `checkSendable` extended with
   the series parent check. Tests: nested folder refused, folder outside the shelf refused, a file
   in two parents, `Vol 2` before `Vol 10`, names with `<b>&"'`.
3. **Drive adapters and routing (`src/Code.js`).** `listSubfolders`, `getFolder` (with its parent
   IDs), `?s=` route; fakes in tests. Tests: `?s=` with a bad, foreign or nested ID gives the
   not-on-shelf page; token still checked first.
4. **Pages (`src/pages.js`).** Shelf page (series, then a "Books" section for loose books), series
   page, confirm with back to its series, empty shelf and empty series messages, paging if decided.
   Tests: escaping, every link carries the token and targets `_top`, no token on the not-found page.

   **Checkpoint A:** lint + tests green; pages render in headless Edge at 618 x 647.

5. **Cache (`src/Code.js`).** Read-through cache with an injectable fake; Refresh link; cache time
   per decision 3. Tests: second request doesn't call Drive, Refresh does, a different `FOLDER_ID`
   misses, the send path never uses the cache.
6. **UI pass** with the `kindle-ui-designer` agent, one page per run at 618 x 647: shelf, series,
   confirm, sent, errors. Fake books only.
7. **Security review** (`agent-skills:security-auditor`) of the folder checks, the `?s=` route and
   the cache. Fix must-fix items with tests.
8. **Owner's guide `docs/setup-phase2.md`:** share the real shelf (per decision 1), set `FOLDER_ID`,
   `npm run deploy`, and the test steps below.

   **Checkpoint B:** lint + tests + audit green; review items fixed; owner's guide ready.

9. **Owner tests on the Kindle** (steps below); results go into this file and `docs/spec.md`. Merge
   to `main` with `--ff-only` only on the owner's yes, then re-run lint and tests on `main`.

## The owner's tests (preview)

| #   | Test                                       | Pass when                                      |
| --- | ------------------------------------------ | ---------------------------------------------- |
| T1  | Open the bookmark                          | The series list shows; time noted              |
| T2  | Tap a series                               | Volumes in natural order (Vol 2 before Vol 10) |
| T3  | Tap a volume, Send                         | "Sent", and it arrives within about 2 minutes  |
| T4  | A loose book at the top of the shelf       | Listed under "Books" and can be sent           |
| T5  | A file over 25 MB, and a non-EPUB/PDF file | Marked "too big" / not listed                  |
| T6  | Add a book in Drive, then tap Refresh      | It appears                                     |
| T7  | Executions page, cold and cached loads     | Durations noted against the target             |

## Decisions for the owner

1. **Where the real shelf lives:** in your main Drive, shared with the ShelfDrop account as
   **Viewer** (recommended: the books stay where they are, the phase 1 decision, and ShelfDrop can
   only read them) or copied into the ShelfDrop account's own Drive.
2. **Shelf size and paging:** roughly how many series, and how many volumes in the biggest one?
   (Recommended: one long scrolling list if under about 40 items; pages of 8 with Next / Previous if
   more, since the Kindle shows about 8 rows per screen.)
3. **Speed target and cache:** cache listings for 30 minutes with a Refresh link, target script time
   under 0.5 s for cached pages (recommended; honest saving about 1 s, the page will still take about
   6–7 s on the Kindle because of Google's frame), or no cache.
4. **The confirm step:** keep it (recommended: no accidental sends on e-ink, the phase 1 decision) or
   put a "Send" button next to each volume on the series page, saving one 8 s page change per book.

Defaults unless you say otherwise: no volume counts on the series list (counting means opening every
series folder, which would slow the first load); empty series folders are shown and say "No books
yet"; series first, then loose books.
