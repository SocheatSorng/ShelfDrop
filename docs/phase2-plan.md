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

## Decisions made (2026-11-24)

1. **Shelf:** books live in **several Google accounts**, shown on the Kindle as **one shelf**. Each
   account shares its books folder with the ShelfDrop Gmail as **Viewer**. Consequences:
   - `FOLDER_ID` takes a comma-separated list of folder IDs (one ID still works). Each ID is checked;
     at most 10.
   - Series with the same name in two folders are merged into one series (natural sort by name,
     ignoring case); its page lists the volumes from all of them. `?s=` carries one folder ID that
     must be a direct child of one of the shelf folders; the page then lists every series folder
     with that name.
   - Loose books from all shelf folders are listed together.
   - A shelf folder that can't be read (unshared, deleted) is skipped, and the shelf page says
     "1 folder couldn't be read" without its ID; `checkSetup` names which one.
   - The send check accepts a file whose parent, or whose parent's parent, is any shelf folder.
2. **Shelf size:** under about 40 per list, so one scrolling list each, no paging.
3. **Speed:** cache listings for 30 minutes with a Refresh link; target under 0.5 s script time for
   cached pages.
4. **Send flow:** keep the confirm page.

Defaults kept: no volume counts on the series list; empty series show "No books yet"; series first,
then loose books.

## UI pass (2026-11-24)

`kindle-ui-designer` at 618 x 647 with fake books. Back and Refresh moved to a top bar on the first
screen (Back repeated after the last volume of a series longer than 5); rows 58 px with a bold "›"
on tappable rows; too-big books italic, not only grey; sizes in rem so the Kindle's large text
works; the "couldn't be read" note boxed.

## Security review (2026-11-24)

`security-auditor`, read-only, over `main..phase-2-shelf`. No must-fix items; phase 1's protections
hold. Fixed, each with tests:

- **SF1:** an unreadable shelf folder is noted as `_lastFolderError` (never hiding a failed send in
  `_lastError`) and remembered for 5 minutes, so it costs one Drive read per 5 minutes, not one per
  page. `checkSetup` shows both.
- **SF2:** folder listings stop at 300 files and 100 folders; the page says "Some books aren't
  shown".
- **N12:** a series page re-checks in Drive that its folders are still on the shelf.
- **N17:** the window title is cut to 100 characters. **N18:** a blank folder name shows as
  "(no name)".

For the owner's guide (task 8):

- **N13:** every account in `FOLDER_ID` is fully trusted: anything it adds to its folder (even a
  folder named like one of your series) can be sent to your Kindle with one tap.
- **N14:** don't list a folder and one of its own subfolders in `FOLDER_ID`.
- **N15:** Refresh on the shelf page reloads the series list; Refresh on a series page reloads its
  volumes.
- **N17 check:** once deployed, open a series named with `<b>&"'` and confirm the tab shows it as text.

## Scope change (2026-11-24): volume folders

The owner's books in other accounts are arranged as **Series → Volume folder → book**, so one level
of volume folders inside a series is now in scope (the intent said subfolders inside a series were
out of scope).

- A series page lists the books directly in the series folder **and** the books directly in each
  folder inside it (a "volume folder"). Anything deeper is ignored.
- **Row label (owner's choice):** a book in a volume folder shows the **volume folder's name**; the
  line under it gives the file name, type and size. Books directly in the series show their file
  name as before. All rows sort together by label in natural order (Volume 2 before Volume 10).
- **Send check:** a file is sendable if its parent is a shelf folder (loose), a series folder (a
  folder whose parent is a shelf folder), or a volume folder (a folder whose parent is a series
  folder). Every folder in that chain is read fresh from Drive. Anything deeper is refused.
- **Speed:** the first visit to a series reads one more folder per volume (about 0.2 s each), then
  the 30-minute cache applies. A series with 30 volume folders may take several seconds the first
  time.
- Volume folders aren't re-checked against Drive on each series page (only series folders are,
  N12): a volume folder moved away can still be listed for up to 30 minutes, but it can't be sent.
- Security review of the deeper send check before the owner's tests.
