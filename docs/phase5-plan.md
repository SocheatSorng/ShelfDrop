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
