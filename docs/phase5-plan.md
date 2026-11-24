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
- **Links:** a folder page is `?t=…&m=<folder ID>`. Only an ID that is in `FOLDER_ID` is accepted;
  anything else shows "Not on the shelf". A series page (`s=`) is looked up in the listing of the
  main folder that holds it, and goes back to that folder's page.
- **Back links:** series page → "Back to the folder"; folder page → "Back to the shelf" (only with
  two or more main folders); confirm, Sent and message pages → the series, or for a loose book its
  main folder (from the send check, which reads Drive fresh).
- **Refresh:** on the folder list it re-reads every main folder; on a folder page, that folder; on a
  series page, as before.

### Tasks (tests first, then code; lint and tests after each)

1. This plan.
2. Model (`src/shelf.js`): `mainFolders`, `findMainOfSeries`; `locateFile`/`checkSendable` also
   return the main folder ID.
3. Pages (`src/pages.js`): `renderFolders`, `renderShelf` as the folder page, back links.
4. Routing and adapter (`src/Code.js`): `m=`, the folder name in listings, single-folder shortcut,
   series looked up per main folder.
5. Docs: `docs/setup.md` part C/H, README, CHANGELOG (1.0.0), `docs/spec.md`.
6. UI pass (`kindle-ui-designer`) on the folder list and a folder page; security review
   (`agent-skills:security-auditor`: a new URL parameter that selects a Drive folder).
7. Owner: deploy `phase-5-refine`, test on the Kindle; merge on the owner's yes; re-tag `v1.0.0`.
