# Phase 2: put your real shelf on the Kindle (owner's steps)

About 30 minutes, plus waiting for books to arrive. You do every sign-in yourself; Claude never needs
your passwords. **Never paste your Kindle address, the token, or the link with `?t=` into the chat.**
Report results in words, with photos or screenshots if something looks wrong.

The web app URL, the token and your Kindle bookmark stay the same: nothing to re-bookmark.

## A. Get each account's books folder ready

Do this in **every Google account that holds books** (your main account and any others), each in
its own Brave profile.

1. Arrange the books folder like this (you can use any folder names):

   ```
   Books/                      ← the top folder: this is what you share
     Some Series/              ← one folder per series
       Some Series Vol 1.epub
       Some Series Vol 2.epub
       Some Series Vol 10.pdf  ← shows after Vol 2 (natural order)
     Another Series/
     A single book.epub        ← books here show under "Books" on the shelf page
   ```

   - Only **EPUB and PDF** files are shown. Files over 25 MB show "too big to send".
   - Folders **inside** a series folder are ignored.
   - A series with the same name in two accounts (capital letters and extra spaces don't matter)
     shows once, with the volumes from both.
   - Keep each list under about 40 items.

2. **Share** the top folder with the ShelfDrop Gmail as **Viewer** (right-click → Share → add the
   ShelfDrop address → Viewer → uncheck "Notify people" if you like → Share). ShelfDrop only reads it.
3. Open the folder and copy its ID from the address bar: the part after `/folders/`. Keep the IDs in
   a note on your PC (not in the chat).

Two rules, from the security review:

- **Only add accounts you fully trust.** Anything an account puts in its shared folder, even a
  folder named like one of your series, can reach your Kindle with one tap.
- **Don't list a folder and one of its own subfolders** (for example the top folder and a series
  folder inside it). Share and list only the top folder of each account.

## B. Deploy the phase 2 code

In PowerShell, in your main ShelfDrop folder (where `npm run deploy` worked in phase 1). Phase 2
is not merged yet, so switch that folder to the phase 2 code for now, without a branch (the branch
is open in Claude's working copy, which is why `--detach` is needed):

```powershell
git switch --detach phase-2-shelf
```

```powershell
npm run deploy
```

It should print the same **Web app URL** as before. Phase 2 asks for no new Google permissions; if
Google does ask, check that the list is still only _See and download all your Google Drive files_
and _Send email as you_, and tell Claude.

## C. Set `FOLDER_ID` to your shelf folders

In the Apps Script editor (ShelfDrop account) → **Project Settings → Script Properties** → edit
**`FOLDER_ID`**: paste the folder IDs from A3, **separated by commas**, up to 10, for example
`1AbC...xyz,1DeF...uvw`. Spaces don't matter.

**For the tests, keep the `ShelfDrop test` folder's ID in the list too.** Its 36 MB PDF and `.txt`
file are used in T5. Remove it after the tests.

**Save script properties.**

## D. Check the setup

In the editor, open `Code.gs`, pick **checkSetup**, click **Run**. The execution log should say:

- `Script Properties look right.`
- `Shelf: N series, M loose books.` with your numbers.
- No line saying `Shelf folder X of Y in FOLDER_ID couldn't be read`. If there is one, folder number
  X in your list isn't shared with the ShelfDrop Gmail, or its ID has a typo.
- `Last error: …` and `Last folder error: …`: write down what they say.

## E. Tests

### On the PC first (Brave private window)

- **T0, token:** the web app URL alone and with `?t=wrong` must still show only "Not found".
- **T8, odd names:** in your test folder, make a folder named `<b>Test & "quotes"</b>` with one
  small EPUB inside. Open your link with the token and tap that series. Check that the tab and page
  title show the name exactly as typed (not bold), and the page works. Then delete that folder.

### On the Kindle

Open the bookmark. Write down for each: worked / didn't, and what you saw.

- **T1:** the **Bookshelf** shows your series, then a **Books** section with loose books. Note
  roughly how many seconds it took.
- **T2:** tap a series with several volumes. They are in natural order (Vol 2 before Vol 10).
  **Back to the shelf** and **Refresh** are at the top.
- **T3:** tap a volume → **Send to Kindle?** → **Send to Kindle** → **Sent**, and **Back to the
  series** goes back to the same series. Note when the book appears in the library (about 2
  minutes for an EPUB).
- **T4:** send a loose book from the **Books** section of the shelf page.
- **T5:** in the `ShelfDrop test` books, the 36 MB PDF shows "too big to send" and can't be tapped;
  the `.txt` file isn't listed.
- **T6:** on the PC, add a new EPUB to one of your series folders in Drive. On the Kindle, open that
  series: it may not show yet (lists are kept for 30 minutes). Tap **Refresh** on the series page:
  now it shows. (Refresh on the shelf page reloads the series list; Refresh on a series page reloads
  its volumes.)
- **T7, speed:** in the editor → **Executions** (left menu), each Kindle page is one `doGet`. Note
  the **Duration** of:
  - the first shelf load after a Refresh (reads Drive),
  - a second shelf load within 30 minutes (from the saved list; target under 0.5 s),
  - a series page.

  And roughly how long each page change feels on the Kindle (it was about 8 s in phase 1; expect
  about 6–7 s, as most of it is Google's frame and the e-ink redraw).

If something fails: **Executions** shows each request; open the failed one and describe its error.
Run **checkSetup** and send its `Last error` and `Last folder error` lines (the Kindle address and
token are hidden in them).

## Afterwards

1. Remove the `ShelfDrop test` folder's ID from `FOLDER_ID` (keep the rest), **Save**.
2. Put your main ShelfDrop folder back on `main`:

   ```powershell
   git switch main
   ```

   This doesn't change the live web app; it keeps running the phase 2 code you deployed.

3. Tell Claude the results. Merging phase 2 into `main` happens only when you say so.

## If phase 2 misbehaves on the Kindle: go back to phase 1

1. In Script Properties, set `FOLDER_ID` back to **one** folder ID (phase 1 code doesn't understand
   a list and would show "Setup needed").
2. In your main ShelfDrop folder:

   ```powershell
   git switch main
   ```

   ```powershell
   npm run deploy
   ```

The same URL then serves the phase 1 code again.
