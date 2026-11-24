# ShelfDrop: statement of intent

Confirmed by the owner on 2026-11-24 (interview with `agent-skills:interview-me`).

- **Outcome:** From the Kindle Paperwhite's browser, the owner opens one bookmarked private page,
  picks a light novel, and it arrives in the Kindle library through Send to Kindle within a couple of
  minutes.
- **User:** The owner alone, on a Kindle Paperwhite 5 (basic experimental browser).
- **Why now:** Downloading directly in the Kindle browser doesn't work: EPUB won't download, and
  Google Drive's redirects and virus-scan pages break the browser.
- **How it works:**
  - Google Drive holds a top "books" folder with one subfolder per series.
  - The page shows the series, then a series' volumes in natural order (Vol 2 before Vol 10).
  - Loose books in the top folder are listed too.
  - Only EPUB and PDF are shown.
  - Books already sent show "✓ sent <date>".
- **Success:** On the Kindle the owner taps a series, then a volume, and the book appears in the
  Kindle library within about 2 minutes. The owner never signs in to Google or types a password on
  the Kindle.
- **Constraint:**
  - Everything runs as a Google Apps Script in the owner's own Google account, with no server, no
    cost, and no jailbreak or changes to the Kindle.
  - The page is protected by a secret-token link that can be changed.
  - The Kindle address and the token live in the script's settings, never in the code or the repo.
  - Amazon receives a copy of each book sent, and the owner accepted that.
  - Files over the email size limit show as "too big".
- **Out of scope:**
  - Moving, renaming, deleting or editing anything in Drive. ShelfDrop only reads the folder.
  - Direct downloads to the Kindle.
  - MOBI, AZW3 or other formats.
  - Subfolders inside a series.
  - Other users, a PIN, or a Google sign-in on the Kindle.
  - Converting or shrinking files.
  - Reading progress or sync beyond the "sent" mark.

## Facts gathered in the interview

- The owner has a Kindle email address (`…@kindle.com`). The owner's Gmail is probably not yet an
  approved sender in Amazon's Personal Document Settings. Adding it is a phase 1 step.
- Which Gmail account sends the books is a phase 1 decision.
- Background: delivery through Send to Kindle was chosen over direct browser downloads in an earlier
  session, because direct downloads are fragile on the Kindle browser.
