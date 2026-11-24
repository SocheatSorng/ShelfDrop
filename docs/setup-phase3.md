# Phase 3: sent marks and a fresh token (owner's steps)

About 20 minutes, plus waiting for one book to arrive. You do every sign-in yourself; Claude never
needs your passwords. **Never paste your Kindle address, the token, or the link with `?t=` into the
chat.** Report results in words, with photos or screenshots if something looks wrong.

What's new in phase 3:

- Every book you have sent shows **✓ sent 24 Nov** (the last time you sent it) on its row and on
  the **Send to Kindle?** page. Books you sent in phases 1 and 2 are marked straight away.
- Dates and the daily limit (15 books) follow **Cambodia time**: the limit starts again at midnight,
  not at 07:00.
- A recipe for changing the token (part D), which you try once as test T3.

## A. Deploy the phase 3 code

In PowerShell, in your main ShelfDrop folder (where `npm run deploy` worked before). Phase 3 is not
merged yet, so switch that folder to the phase 3 code for now, without a branch (the branch is open
in Claude's working copy, which is why `--detach` is needed):

```powershell
git switch --detach phase-3-hardening
```

```powershell
npm run deploy
```

It should print the same **Web app URL** as before. Phase 3 asks for no new Google permissions; if
Google does ask, check that the list is still only _See and download all your Google Drive files_
and _Send email as you_, and tell Claude.

## B. Check the setup

In the editor, open `Code.gs`, pick **checkSetup**, click **Run**. The log should say
`Script Properties look right.` and your shelf counts. Write down the `Last error` and
`Last folder error` lines.

## C. Tests on the Kindle

Write down for each: worked / didn't, and what you saw.

- **T0, token:** on the PC (Brave private window) the web app URL alone and with `?t=wrong` still
  show only "Not found".
- **T1, sent mark:** open a series and send a volume you haven't sent before. Tap **Back to the
  series**: that volume's row now ends with **✓ sent** and today's date. Tap it: the **Send to
  Kindle?** page shows the same mark. Is the mark easy to spot when you scan the list?
- **T2, cooldown:** on that page, tap **Send to Kindle** again (within 10 minutes): **Not sent**,
  "sent a few minutes ago", and no second copy arrives.
- **T3, new token:** follow part D below. Then the old bookmark shows **Not found**, and the new link
  opens your bookshelf.
- **T4, checkSetup:** run it once more. The log shows counts and names only: no Kindle address, no
  token and no file IDs.

If something fails: **Executions** (left menu) shows each request; open the failed one and describe
its error. Run **checkSetup** and send its `Last error` and `Last folder error` lines (the Kindle
address and token are hidden in them).

## D. Change the token (also the recipe if the link ever leaks)

The token is the secret part of your bookmarked link (`?t=…`). Changing it makes the old link stop
working at once.

1. In PowerShell, in your ShelfDrop folder, copy a new token to the clipboard without showing it:

   ```powershell
   npm run --silent token | clip
   ```

2. Apps Script editor (ShelfDrop account) → **Project Settings → Script Properties** → edit
   **`ACCESS_TOKEN`** → select all, paste with Ctrl+V → **Save script properties**. From now on the
   old link shows "Not found".
3. Remove the old link from everywhere it is kept, because it still holds the old token:
   - **Amazon:** amazon.com → **Manage Your Content and Devices** → **Content** → **Docs** →
     the **ShelfDrop link** document → **Delete** (this removes it from the Kindle too).
   - **ShelfDrop Gmail:** **Sent** → the mail named **ShelfDrop link** → **Delete**, then empty it
     from **Trash**.
4. Editor → pick **sendLinkToKindle** → **Run**. In a minute or two a new **ShelfDrop link**
   document arrives on the Kindle.
5. On the Kindle: open the new document, tap **Open my bookshelf**, bookmark the page, and delete the
   old bookmark.

Your sent marks, books and settings are not touched; only the link changes.

## Standing rules (to leave ShelfDrop running safely)

- **Keep the ShelfDrop Google account for ShelfDrop only.** It holds the app and sends the books.
- **Never give anyone edit access to your shelf folders**, and only list accounts you fully trust in
  `FOLDER_ID`: anything they put in their shared folder can reach your Kindle with one tap.
- **Leave the `_sent:` and `_count:` entries in Script Properties alone.** They are the sent marks
  and today's count, not settings. Deleting a `_sent:` entry only removes that book's mark.
- If the link leaks, or you lend the Kindle to someone, change the token (part D).

## Afterwards

1. Put your main ShelfDrop folder back on `main`:

   ```powershell
   git switch main
   ```

   This doesn't change the live web app; it keeps running the phase 3 code you deployed.

2. Tell Claude the results. Merging phase 3 into `main` happens only when you say so.

## If phase 3 misbehaves: go back to phase 2

In your main ShelfDrop folder:

```powershell
git switch main
```

```powershell
npm run deploy
```

The same URL then serves the phase 2 code again. A token you changed in part D stays changed.
