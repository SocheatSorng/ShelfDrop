# Changelog

All notable changes to ShelfDrop. Versions follow [Semantic Versioning](https://semver.org). Each
phase's plan and results are in `docs/`.

## 1.0.0 (2026-11-24)

The first release.

- The first page lists each main folder (each folder in `FOLDER_ID`) by its own name; tapping one
  shows its series and loose books. With one main folder, its page opens straight away. Folders
  and series from different accounts are no longer merged. Links name a folder by its place in
  `FOLDER_ID`, never by its ID.
- A volume folder with two or more books is one row ("Volume 2", "3 books") that opens a page of
  its books; a volume folder with one book still shows as that book.
- Icons: a folder on rows that open a page, and a page labelled EPUB or PDF on book rows and the
  confirm page (drawn in CSS: no images). The type left the line under each book.
- `checkSetup` counts series per folder and points at the guide when Script Properties fill up.
- One setup guide, [docs/setup.md](docs/setup.md), from nothing to a bookmark on the Kindle, with
  updating, changing the token, going back to an earlier version, troubleshooting and another time
  zone. The phase guides stay as history.
- README for the release; MIT license.
- A test keeps the README, the guide and this changelog in step with the code (commands, links,
  Script Properties, editor functions).

## 0.3.0: hardening

- "✓ sent <date>" on every book you have sent, on its row and on the confirm page.
- The daily limit (15 books) and the dates follow Cambodia time.
- Tests that no page shows the Kindle address, folder IDs or Google's error text.
- A recipe for changing the token. `checkSetup` reports how full Script Properties are.
- Security review fixes: bad sent marks are skipped; the daily count is written first, so a full
  Script Properties can't switch the limit off. Plan and results:
  [docs/phase3-plan.md](docs/phase3-plan.md).

## 0.2.0: the shelf

- Series and loose books, natural order (Vol 2 before Vol 10), one level of volume folders.
- One shelf from several Google accounts (`FOLDER_ID` is a list of up to 10 folders).
- EPUB and PDF only; files over 25 MB show "too big to send".
- Lists kept for 30 minutes, with **Refresh**. A Kindle-friendly design. Plan and results:
  [docs/phase2-plan.md](docs/phase2-plan.md).

## 0.1.0: the spike

- Proved that the Kindle browser can use an Apps Script web app and that Send to Kindle accepts its
  mail (EPUB and PDF, up to Gmail's 25 MB). A secret-token link, read-only Drive access, send-only
  mail, a daily limit and `npm run deploy`. Plan and results:
  [docs/phase1-plan.md](docs/phase1-plan.md).
