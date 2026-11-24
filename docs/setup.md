# Set up ShelfDrop

This guide takes you from nothing to a bookmark on your Kindle that sends books from your Google
Drive. It takes about an hour, most of it in Google's and Amazon's settings pages. It is written for
Windows PowerShell; the commands are the same on macOS and Linux, except where noted.

**Keep three things private:** your Kindle address, the access token, and your link with `?t=` in
it. Don't paste them into chats, issues or screenshots. ShelfDrop never displays them as text on its pages
or in its logs. The token is part of every link on the page, so it is in the Kindle browser's history.

## What you need

- A Kindle with a web browser (made for a Kindle Paperwhite 5; any Kindle that receives Send to
  Kindle e-mails should work).
- An Amazon account with that Kindle registered.
- A Google account for your books (your normal one is fine), with the books in Google Drive.
- A PC with [Git](https://git-scm.com) and [Node.js](https://nodejs.org) 22 or newer.
- A **new Gmail account just for ShelfDrop** (part A). It holds the app and sends the books.

ShelfDrop only reads your Drive. It sends EPUB and PDF files up to 25 MB (Gmail's limit) and at most
15 books a day. Amazon keeps a copy of every book you send; that is how Send to Kindle works.

## A. The ShelfDrop Google account

1. Create a new Gmail account. A separate browser profile for it keeps it apart from your main
   Google account. "The ShelfDrop account" below means this account.
2. Signed in as the ShelfDrop account, open https://script.google.com/home/usersettings and turn
   **Google Apps Script API** on. (clasp needs this to upload the code.)

Use this account for ShelfDrop only.

## B. Amazon: allow the ShelfDrop account to send to your Kindle

1. On Amazon: **Manage Your Content and Devices** → **Preferences** → **Personal Document
   Settings**.
2. Under **Approved Personal Document E-mail List** → **Add a new approved e-mail address** → enter
   the ShelfDrop Gmail address → **Add Address**.
3. On the same page, under **Send-to-Kindle E-Mail Settings**, find your Kindle's address
   (`yourname@kindle.com`). You need it in part E.

## C. Your shelf in Google Drive

In each Google account that holds books, arrange one top folder like this (any names work):

```
Light Novels/               ← the main folder: this is what you share; its name is shown
  Some Series/              ← one folder per series
    Some Series Vol 1.epub
    Some Series Vol 2.epub
    Some Series Vol 10.pdf  ← listed after Vol 2 (natural order)
  Another Series/
    Volume 1/               ← or one folder per volume: the row shows "Volume 1",
      any-file-name.pdf        with the file name underneath
    Volume 2/
      another-file.epub
  A single book.epub        ← books here are listed after the series
```

- Only **EPUB and PDF** files are listed. Files over 25 MB show "too big to send".
- Books can be directly in a series folder, in **volume folders** inside it, or both. Folders inside
  a volume folder are ignored.
- On the Kindle, the first page lists each account's main folder by its name, in the order of
  `FOLDER_ID`; tap one to see its series and books. With only one main folder, its page opens
  straight away. Folders and series from different accounts are never merged, even with the
  same name, so give each main folder its own name ("Light Novels", "Manga").
- Keep lists short enough to scroll on the Kindle. Hard limits: 300 books and 100 folders per
  folder, and 40 volume folders per series. Past them, the page says "Some books aren't shown: a
  folder holds too many files."

Then, for each top folder:

1. **Share** it with the ShelfDrop Gmail as **Viewer** (right-click → Share → add the address →
   Viewer → Share).
2. Open it and copy its **ID** from the address bar: the part after `/folders/`. Keep the IDs in a
   note on your PC.

Two rules:

- **Only use accounts you fully trust.** Anything put in a shared shelf folder can reach your Kindle
  with one tap.
- **Share and list only the top folder** of each account, never a folder and one of its subfolders.

## D. Install the app

1. Signed in as the ShelfDrop account, open https://script.google.com → **New project**. Rename it
   **ShelfDrop**. Open **Project Settings** (gear icon) and copy the **Script ID**.

2. In PowerShell, get the code and the tools:

   ```powershell
   git clone https://github.com/SocheatSorng/ShelfDrop.git
   ```

   ```powershell
   cd ShelfDrop
   ```

   ```powershell
   npm ci
   ```

3. Sign clasp (Google's Apps Script command-line tool) in to the ShelfDrop account. A browser tab
   opens; if it opens in the wrong profile, copy its address into the ShelfDrop one. Choose the
   ShelfDrop account and allow. clasp keeps this sign-in in your user folder (`.clasprc.json`),
   never in the repo.

   ```powershell
   npm run clasp -- login
   ```

4. Connect this folder to your project (paste the Script ID from step 1). This writes
   `.clasp.json`, which git ignores:

   ```powershell
   npm run clasp:init -- PASTE_SCRIPT_ID_HERE
   ```

5. Upload the code and deploy the web app:

   ```powershell
   npm run deploy
   ```

   It prints the **Web app URL**, ending in `/exec`. It also writes `.deployment.json` (git
   ignores it). Keep that file: it is how later deploys keep the same URL.

## E. Script Properties (the settings)

In the Apps Script editor (reload it after the deploy): **Project Settings** → **Script
Properties** → **Add script property**, once for each:

| Property       | Value                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| `FOLDER_ID`    | the folder ID from part C. Several accounts: up to 10 IDs separated by commas          |
| `KINDLE_EMAIL` | your Kindle address from part B (`…@kindle.com` or `…@free.kindle.com`)                |
| `ACCESS_TOKEN` | a new random token: run the command below, then paste with Ctrl+V                      |
| `WEB_APP_URL`  | the Web app URL that `npm run deploy` printed (ends with `/exec`)                      |
| `MAX_MB`       | optional: a lower size limit in MB, 1 to 25. Leave it out to use 25, Gmail's own limit |

To make the token:

```powershell
npm run --silent token | clip
```

This puts a new token on the clipboard without showing it (on macOS use `| pbcopy` instead of
`| clip`). After pasting it, clear it from Windows' clipboard history: press **Win+V** and delete
the entry. If clipboard sync is on (Settings → System → Clipboard), the token also went to your
Microsoft account: turn sync off before making tokens.

Then **Save script properties**.

Use the `/exec` URL for `WEB_APP_URL`, never the `/dev` one: only you can open `/dev`, so it would
break every link on the Kindle.

## F. Authorise and check the setup

1. In the editor, open `Code.gs`, pick **checkSetup** in the function menu at the top and click
   **Run**.
2. Google asks for permission: **Review permissions** → the ShelfDrop account. It shows "Google
   hasn't verified this app" because it is your own script: **Advanced** → **Go to ShelfDrop
   (unsafe)**. The list must show only:
   - _See and download all your Google Drive files_
   - _Send email as you_

   Then **Allow**. If it asks for anything else, stop: the code is not what this guide describes.

3. The **Execution log** should say:
   - `Script Properties look right.` Otherwise it names the properties to fix (never their values).
   - `Shelf: N series, M loose books in F folders.` with your numbers.
   - No line `Shelf folder X of Y in FOLDER_ID couldn't be read`. If there is one, folder number X
     in your list isn't shared with the ShelfDrop account as Viewer, or its ID has a typo.

## G. Put the link on your Kindle

1. On the PC, in a private browser window, check the token works: the Web app URL alone shows
   **Not found**, and so does the URL with `?t=wrong` added.
2. In the editor, pick **sendLinkToKindle** → **Run**. Within a few minutes a document **ShelfDrop
   link** arrives in your Kindle library.
3. On the Kindle, open it and tap **Open my bookshelf**. The Kindle browser opens your bookshelf.
   Bookmark it (browser menu → **Add Bookmark**).

A grey Google banner ("created by a Google Apps Script user") on top is normal.

## H. Everyday use

Open the bookmark, tap a series, tap a volume, tap **Send to Kindle**. The **Sent** page appears,
and the book is in your library a minute or two later (PDFs are often faster than EPUBs).

- Every book you have sent shows **✓ sent 24 Nov** (the last time you sent it).
- Lists are kept for 30 minutes. Added a book in Drive? Tap **Refresh** on the page that should show it.
- Limits: 15 books a day (the day starts at midnight in the app's time zone, part N), and the same
  book at most once every 10 minutes. They stop a leaked link from flooding your Kindle.
- Each page change takes several seconds on the Kindle. Most of that is Google's page frame and the
  e-ink redraw.

## I. Update to a new version

In your ShelfDrop folder:

```powershell
git pull
```

```powershell
npm ci
```

```powershell
npm run deploy
```

If you changed the time zone (part N), commit that change first (`git commit -am "My time zone"`),
so `git pull` can merge it.

The deploy prints the same Web app URL, so your bookmark keeps working. If Google asks for permissions
again, check that the list is still only the two in part F.

## J. Change the token

Changing `ACCESS_TOKEN` makes the old link stop working at once. Anyone with the link can send books
to your Kindle and see which books you sent. Change it when the link was shared or forwarded, the
Kindle is lost, sold or lent, or you change who is on Amazon's approved list.

1. Copy a **whole new** token to the clipboard. Never change only a letter or two of the old one: a
   token close to a known one can be guessed.

   ```powershell
   npm run --silent token | clip
   ```

2. Editor → **Project Settings** → **Script Properties** → edit **`ACCESS_TOKEN`** → select all,
   paste → **Save script properties**. The old link now shows "Not found".
3. Remove the old link everywhere it is kept:
   - **Amazon:** **Manage Your Content and Devices** → **Content** → **Docs** → the **ShelfDrop
     link** document → **Delete**. Deleting it on the Kindle alone may leave it in your library.
   - **ShelfDrop Gmail:** **Sent** → the mail **ShelfDrop link** → **Delete**, then empty it from
     **Trash**.
4. Run **sendLinkToKindle** again (part G), bookmark the new link, delete the old bookmark, and
   clear the Kindle browser's history (browser menu → **Settings** → **Clear History**).

Your books, sent marks and other settings don't change.

## K. Go back to an earlier version

If a new version misbehaves, deploy the previous one. In your ShelfDrop folder, with the version's
tag (for example `v1.0.0`; `git tag` lists them):

```powershell
git switch --detach v1.0.0
```

```powershell
npm run deploy
```

```powershell
git switch main
```

The same URL then serves the older code. Switching back to `main` doesn't change the live app; the
next `npm run deploy` from `main` does.

## L. When something goes wrong

- **The page says "Setup needed":** run **checkSetup**; it names the Script Properties to fix.
- **A book never arrives:** look in the ShelfDrop Gmail inbox for a message from Amazon. Check that
  the ShelfDrop address is on Amazon's approved list (part B) and the Kindle address is right.
- **"Not sent":** the page says why: the daily limit, the book was sent a few minutes ago, another
  book is being sent, the account's e-mail quota is used up, or the mail failed (try again later).
- **Details:** in the editor, **Executions** (left menu) lists each request; open a failed one to
  see its error. **checkSetup** also shows the `Last error` and `Last folder error`. The Kindle
  address and token are hidden in ShelfDrop's own log lines. Google's error text comes in the
  account's language.
- **`.deployment.json` is lost:** make it again before deploying, or the deploy makes a second Web
  app URL. Your `WEB_APP_URL` is `https://script.google.com/macros/s/<deploymentId>/exec`; create
  `.deployment.json` in your ShelfDrop folder with `{ "deploymentId": "<deploymentId>" }`. If a
  second URL was already made, `npm run clasp -- deployments` lists them; remove the unwanted one
  with `npm run clasp -- undeploy <deploymentId>`, but never the one marked `@HEAD` (that is the
  editor's own `/dev` deployment).
- **checkSetup says Script Properties are nearly full:** every sent book leaves a mark of about 55
  bytes, so this takes thousands of books. Delete some of the oldest `_sent:` entries in Script
  Properties (their values are times in milliseconds; smaller is older). That only removes those
  books' marks.

## M. Rules for leaving it running

- Keep the ShelfDrop Google account for ShelfDrop only.
- Never give anyone edit access to your shelf folders, and list only accounts you fully trust in
  `FOLDER_ID`.
- Leave the `_sent:` and `_count:` entries in Script Properties alone (except as in part L): they
  are the sent marks and today's count, not settings.
- If the link leaks, or you lend the Kindle, change the token (part J).

## N. Another time zone

ShelfDrop uses Cambodia time (UTC+7) for the sent dates and for the start of the daily limit. For
another time zone without daylight saving, change two lines before you deploy:

- `src/limits.js`: `LOCAL_UTC_OFFSET_MS`, your offset from UTC in hours times `60 * 60 * 1000`.
- `src/appsscript.json`: `timeZone`, your
  [time zone name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) (it sets the log
  times).

With daylight saving, dates near midnight can be an hour off; nothing else is affected. Deploying a
time zone change can reset that day's count once. The tests that check Cambodia time
(`tests/sent-marks.test.js`, `tests/manifest.test.js`) then fail until you change them to match.
