# Phase 5 plan: refinements before the first push

Refinements the owner asked for after 1.0.0 was tagged but before it was pushed. Branch
`phase-5-refine`. The version stays **1.0.0** (owner's decision): the local `v1.0.0` tag is deleted
and made again on the merged `main`.

## Refinement 1: a page per main folder (2026-11-24)

The shelf page said "Bookshelf" and "Books". It now shows each account's main folder (each folder
in `FOLDER_ID`) by its own name.

### Decisions (owner)

1. **Folder list first.** The first page, titled "ShelfDrop", lists the main folders. Tapping one
   opens its page: the folder's name as the title, its series, then its loose books (no "Books"
   heading).
2. **One main folder:** the first page is that folder's page straight away (no extra tap, no
   folder list).
3. **Never merge main folders.** Each folder in `FOLDER_ID` is its own row, even when two have the
   same name. A series merges only with a same-named series **in the same main folder**; the
   phase 2 merge across accounts goes away.

### Design

- **Order:** the folder list keeps the order of `FOLDER_ID`, so the owner chooses it.
- **Names** come from the listing Drive already returns for each main folder (no extra Drive call),
  cached with it for 30 minutes. A listing cached before the update has no name; it shows "Folder 2"
  (its place in `FOLDER_ID`) until the cache refreshes. An unreadable folder is left out of the list,
  with the existing note "1 shelf folder couldn't be read".
- **Links:** a folder page is `?t=…&m=1` (its place in `FOLDER_ID`, 1 to 99), never the folder ID:
  folder IDs are settings that no page may show (phase 3 rule, enforced by the leak sweeps; the first
  design used the ID and those tests caught it). Any other `m` shows "Not on the shelf" and reads
  nothing. A series page (`s=`) is looked up in the listing of the main folder that holds it, and
  goes back to that folder's page.
- **Back links:** series page → "Back to the folder"; folder page → "Back to the shelf" (only with
  two or more main folders); confirm, Sent and message pages → the series, or for a loose book its
  main folder (from the send check, which reads Drive fresh).
- **Refresh:** on the folder list it re-reads every main folder; on a folder page, that folder; on a
  series page, as before.

### Tasks (tests first, then code; lint and tests after each)

1. This plan.
2. Model (`src/shelf.js`): `mainFolders`, `findMainOfSeries` (over `{ id, listing }` pairs);
   `locateFile`/`checkSendable` also return the main folder ID.
3. Pages (`src/pages.js`): `renderFolders`, `renderShelf` as the folder page, back links.
4. Routing and adapter (`src/Code.js`): `m=`, the folder name in listings, single-folder shortcut,
   series looked up per main folder.
5. Docs: `docs/setup.md` part C/H, README, CHANGELOG (1.0.0), `docs/spec.md`.
6. UI pass (`kindle-ui-designer`) on the folder list and a folder page; security review
   (`agent-skills:security-auditor`: a new URL parameter that selects a Drive folder).
7. Owner: deploy `phase-5-refine`, test on the Kindle; merge on the owner's yes; re-tag `v1.0.0`.

### Built (2026-11-24)

Tasks 1–5 done: 150 tests (model, pages, requests, leak sweeps over the new pages and an `m` set to a
folder ID). `checkSetup` now logs `Shelf: N series, M loose books in F folders.`

### UI pass (2026-11-24)

`kindle-ui-designer` at 618 x 647 (also tall, 150% text, greyscale, inverted for dark mode) with fake
data. In one list, series rows looked like book rows. Rows that open a page (folders, series) are now
**bold**, and a 1rem gap with a double line separates them from the book rows. Long names wrap with the
arrow centred; names are escaped. For the owner to judge on the Kindle: whether the gap reads as a new
group, and whether a page of bold folder names is too heavy.

### Security review (2026-11-24)

`agent-skills:security-auditor`, read-only. No must-fix items: `m` maps only to a place in
`FOLDER_ID`, the token still comes first, no `FOLDER_ID` value reaches a page. Fixed, with tests:
the leak sweeps now cover the single-folder pages; a series moved to another main folder within the
cache's 30 minutes stops showing under the old one (the fresh check requires that main folder); `s`
and `f` win over `m`. For the owner's test: a folder named like `<b>x</b> & "q"` shows literally in
the tab and the title. Notes left: a duplicate `FOLDER_ID` entry is harmless (first place wins).

### Bug found on the Kindle (2026-11-24)

After the deploy (@12) the first page showed "Folder 1", "Folder 2" instead of the folder names:
the listings cached by 1.0.0 have no name, and the plan let the page fall back to the place number
until the cache ran out (up to 30 minutes). A stale cache must never change what the reader sees,
so cache keys now carry a format version (`LISTING_CACHE_FORMAT`, `v2:`) and 1.0.0's entries are
never read. Test: a listing cached in the old format is ignored and the names show at once.

## Refinement 2: a page per volume folder with several books (2026-11-24)

### Decisions (owner)

1. A volume folder (inside a series) with **two or more books** is one **bold row** with the count
   underneath ("Volume 2", "3 books"); tapping it opens its page. A volume folder with **one book**
   keeps its row: the folder name, with the file name underneath. With none it isn't shown.
2. The volume page is titled by the folder's name, with "Back to the series" and Refresh; its rows
   are the file names in natural order, with type, size and sent mark. A book sent from it goes back
   to the volume page.

### Design

- **Links:** `?t=…&s=<series>&v=<volume folder ID>`. Volume folder IDs, like series IDs, may appear
  in links (they are not settings). The volume is used only if the series' own listing has it and
  Drive, read fresh, still puts it in one of the series' folders; the series is checked first as
  before. Anything else shows "Not on the shelf".
- **Cost:** a volume page reads the main folders and the series (cached) and that one volume, not
  every volume of the series.
- **Back link after a send:** the send check already reads the volume folder fresh; the book count
  comes from its listing (cached). Two or more books: back to the volume, else to the series.
- **Tests:** model rows and counts (too-big books count, non-books don't), the volume page, the
  fresh check (unknown, another series', moved away), the back links, and both leak sweeps.

### UI pass and security review (2026-11-24)

- **UI pass** (`kindle-ui-designer`, fake data, 618 x 647, tall, 150% text, greyscale, dark): no
  change needed. Multi-book volume rows are bold with "N books"; one-book volume rows look like
  book rows; long titles wrap; pages are 2.8–4.0 KB. For the owner: is bold easy to tell from
  regular on the real panel?
- **Security review** (`agent-skills:security-auditor`): no must-fix. `v` reaches only a direct
  volume folder of a freshly checked series. Added tests: wrong tokens on `m`, `s`, `v` read no
  folders; a folder inside a volume is refused, its books never listed and not sendable; an unlisted
  `v` is never looked up. Noted, left: the send reads the volume listing (cached) to choose the back
  link; a volume added in the last 30 minutes needs Refresh on the series page.

## Refinement 3: icons for folders, EPUB and PDF (2026-11-24)

### Decisions (owner)

1. **Style B, labelled pages:** a folder icon for folders; for books a page with "EPUB" or "PDF"
   printed in it, so the type can't be misread. The type leaves the meta line ("2.0 MB", not
   "EPUB · 2.0 MB").
2. **Where:** folder rows (main folders, series, volume folders with several books), book rows
   (grey on too-big rows) and the confirm page. Not the Sent page.

### Design

- **Drawn in CSS:** a bordered box with the type in bold sans-serif, and a box with a tab
  (`:before`) for folders. No images, SVG or script; the CSS is sent once per page, so a row costs
  about 30 bytes. Both use the text colour, so too-big rows are grey and dark mode inverts them.
  Emoji (📁) were ruled out: the Kindle's Chromium 80 fonts often show them as boxes.
- **Markup:** the icon is the row's last child, positioned at its left; the type icon is real text
  (read out by screen readers), the folder icon is `aria-hidden`.
- Tests: icons on every kind of row and the confirm page, none on the Sent page, no type in the meta
  line, and no `<img>`, `<svg>`, `<script>` or `url(` on the pages.
