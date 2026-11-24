# Phase 1: set up and run the spike (owner's steps)

About 30–45 minutes. You do every sign-in and every password yourself; Claude never needs them.
**Never paste your Kindle address, the token, or the link with `?t=` into the chat** — Claude doesn't
need them. Report results in words (and photos of the Kindle if something looks wrong).

Tip: make a separate Brave profile called **ShelfDrop** for the new Gmail, so it never mixes with
your main Google account. "ShelfDrop account" below means that new Gmail.

## A. The ShelfDrop Google account

1. Create the new Gmail account (in the ShelfDrop Brave profile).
2. Still signed in as it, open https://script.google.com/home/usersettings and turn **Google Apps
   Script API** on. (clasp needs this.)

## B. Amazon: allow the ShelfDrop account to send to your Kindle

1. On amazon.com: **Account → Content Library → Preferences** (or "Manage Your Content and
   Devices" → **Preferences**) → **Personal Document Settings**.
2. Under **Approved Personal Document E-mail List** → **Add a new approved e-mail address** → enter
   the ShelfDrop Gmail address → **Add Address**.
3. On the same page, under **Send-to-Kindle E-Mail Settings**, note your Paperwhite's address
   (`…@kindle.com`). You'll paste it in step D5.

## C. Test books (in your main Google account)

1. In your main Google Drive, make a folder **ShelfDrop test**.
2. Put in it, downloaded in your own browser:
   - one EPUB (e.g. any book from https://standardebooks.org),
   - one small PDF (any public-domain PDF),
   - one **large PDF between 15 and 24 MB** (e.g. an illustrated public-domain book from
     https://archive.org, "PDF" download),
   - if you can find one, a **PDF over 26 MB**,
   - one non-book file (e.g. a `.txt`), to check it is hidden.
3. **Share** the folder with the ShelfDrop Gmail as **Viewer**.
4. Open the folder and copy its ID from the address bar: the part after `/folders/`.

## D. Install the script (ShelfDrop account)

In the ShelfDrop Brave profile:

1. Open https://script.google.com → **New project**. Rename it **ShelfDrop** (click "Untitled
   project"). Open **Project Settings** (gear icon) and copy the **Script ID**.

In PowerShell, in the ShelfDrop folder:

2. Sign clasp in to the ShelfDrop account. A browser tab opens; if it opens in the wrong Brave
   profile, copy its address into the ShelfDrop profile. Choose the ShelfDrop account and allow.
   clasp keeps its sign-in in your user folder (`.clasprc.json`), never in the repo.

   ```powershell
   npm run clasp -- login
   ```

3. Connect this folder to the project (paste the Script ID; it goes into the git-ignored
   `.clasp.json`):

   ```powershell
   npm run clasp:init -- PASTE_SCRIPT_ID_HERE
   ```

4. Push the code and deploy the web app. It prints the **Web app URL** (ending in `/exec`):

   ```powershell
   npm run deploy
   ```

5. In the Apps Script editor (reload the page): **Project Settings → Script Properties → Add script
   property**, three times:

   | Property       | Value                                                                 |
   | -------------- | --------------------------------------------------------------------- |
   | `FOLDER_ID`    | the folder ID from C4                                                 |
   | `KINDLE_EMAIL` | your Kindle address from B3                                           |
   | `ACCESS_TOKEN` | a new token: run the command below, then paste with Ctrl+V            |
   | `WEB_APP_URL`  | the **Web app URL** that `npm run deploy` printed (ends with `/exec`) |

   ```powershell
   npm run --silent token | clip
   ```

   (This copies a new random token to the clipboard without showing it.) **Save script properties.**
   Then clear it from Windows' clipboard history: press **Win+V** and delete the entry (or check
   that clipboard sync is off under Settings → System → Clipboard).

6. **Authorise (experiment E8).** In the editor open `Code.gs`, pick **checkSetup** in the function
   menu at the top, click **Run**, then **Review permissions** → the ShelfDrop account. Google shows
   "Google hasn't verified this app" because it is your own script: **Advanced → Go to ShelfDrop
   (unsafe)**. Check the permission list shows only:
   - _See and download all your Google Drive files_
   - _Send email as you_

   Then **Allow**. The execution log should say "Script Properties look right", the number of books
   found (your EPUB and PDFs, not the `.txt`), and the e-mails left today. If it says "Set
   WEB_APP_URL …", fix that property: it must be the `/exec` URL from `npm run deploy`, not the
   `/dev` one (only you can open `/dev`, so it would break every link on the Kindle).

## E. Experiments

### On the PC first (Brave private window)

- **E7:** open the web app URL **without** anything after `/exec` → "Not found". Add `?t=wrong` →
  "Not found". Then add `?t=` plus your token (paste from Script Properties) → the book list.
  Don't send from the PC.

### Get the link onto the Kindle

In the editor, pick **sendLinkToKindle** → **Run**. Within a few minutes a document **ShelfDrop
link** appears in the Kindle library. Open it and tap **Open my bookshelf**; the Kindle browser
opens. Bookmark the page (browser menu → **Add bookmark**). If the document doesn't arrive, or the
link can't be tapped, type the URL with `?t=<token>` in the Kindle browser instead, and tell Claude.

### On the Kindle

Write down for each: worked / didn't, and what you saw.

- **E1:** the bookmark opens the **Books** list and it is readable. (There may be a grey Google banner
  "created by a Google Apps Script user" — that's expected.)
- **Browser check:** tap **Browser check** at the bottom of the list. Note what it says for
  JavaScript, Browser and Page width (no need to copy the long browser line exactly; a photo is
  fine).
- **E2:** tap the EPUB → the **Send to Kindle?** page opens.
- **E3:** tap **Send to Kindle** → the **Sent** page appears.
- **E4:** note the time. When does the EPUB appear in the library? Does it open and look right?
- **E5:** the same with the small PDF.
- **E6:** the same with the 15–24 MB PDF. Then, if you have a PDF over 26 MB: it shows "too big to
  send". In Script Properties add `MAX_MB` = `30`, reload the list, and try sending it. Note what
  the page says and whether it arrives. Then **delete** `MAX_MB` again.

If something fails: in the editor, **Executions** (left menu) shows each request; open the failed
one and describe its error (the Kindle address and token are hidden in ShelfDrop's own log lines).
If a book never arrives, look in the ShelfDrop Gmail inbox for a message from Amazon.

## Afterwards

Tell Claude the results. Leave the web app running for now; it only sends books from the test
folder to your own Kindle, only with the token, and at most 15 a day (the same book at most once
every 10 minutes).

Good to know:

- ShelfDrop keeps its counters in Script Properties as entries starting with `_sent:` and
  `_count:`. Leave them; they are not settings.
- If the link ever leaks: put a new `ACCESS_TOKEN` in Script Properties (the old link stops
  working at once), delete the old **ShelfDrop link** document from your Amazon library and the
  sent mail in the ShelfDrop Gmail, then run **sendLinkToKindle** again.
- If `.deployment.json` is ever lost, `npm run deploy` makes a second web app URL and the old one
  stays live. List them with `npm run clasp -- deployments` and remove the old one with
  `npm run clasp -- undeploy <deploymentId>`.
