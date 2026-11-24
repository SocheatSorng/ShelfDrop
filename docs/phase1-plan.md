# Phase 1 plan: the spike

Goal: prove the riskiest assumptions with the smallest real deployment, before building the shelf.
Branch `phase-1-spike`, version 0.1.0. Spike code is still tested and safe (it is deployed with
anonymous access), but kept minimal; phase 2 can rewrite the pages.

## Experiments

| #   | Question                                                                                                    | How we find out                                                   | Pass when                                                         |
| --- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| E1  | Does the Kindle browser open an Apps Script web app page (sandboxed iframe, banner)?                        | Owner opens the bookmark on the Kindle                            | The test list is readable                                         |
| E2  | Do links (`target="_top"`) work and keep the token?                                                         | Owner taps a book on the Kindle                                   | The confirm page opens                                            |
| E3  | Does a POST form (the "Send" button) work from the Kindle?                                                  | Owner taps "Send"                                                 | A "sent" page shows, `doPost` ran (Apps Script executions log)    |
| E4  | Does Send to Kindle accept an EPUB sent by MailApp?                                                         | Send a public-domain EPUB                                         | It appears in the library and opens; time noted                   |
| E5  | Same for a PDF                                                                                              | Send a public-domain PDF                                          | Same                                                              |
| E6  | What is the real size limit?                                                                                | Send a ~20 MB file and a ~24 MB file; try one over 25 MB          | Known limit; over-limit refused by our check with a clear message |
| E7  | Does a wrong or missing token reveal nothing?                                                               | Open the link without / with a wrong token (Brave private window) | Blank "not found" page, nothing sent                              |
| E8  | Do the least-privilege scopes (`drive.readonly`, `script.send_mail`) work for listing, reading and mailing? | Authorise once in the Apps Script editor                          | Authorisation screen lists only those two; E1–E5 work             |

A small `?t=…&diag=1` page shows the browser's user agent and whether JavaScript ran, to record what
the Kindle browser is (helps phase 2 design).

Fallbacks if an experiment fails:

- E1/E2 fail → try `HtmlService` `XFrameOptionsMode`, plain `<a>` without target, or a meta refresh;
  if the iframe itself is the blocker, re-plan (for example, a tiny static page hosted elsewhere
  that calls the script) and ask the owner before choosing.
- E3 fails → GET link with a one-time confirm code instead of a POST form.
- E4/E5 fail → check the approved sender and subject; try GmailApp only with the owner's OK (it
  needs a much broader scope).

## Tasks (thin slices, each: code → tests → lint → commit)

1. `src/appsscript.json`: V8, `webapp: { executeAs: USER_DEPLOYING, access: ANYONE_ANONYMOUS }`,
   `oauthScopes: [drive.readonly, script.send_mail]`, time zone. Test: manifest has exactly those
   scopes and settings.
2. `src/access.js`: constant-time token compare, refuses empty or short (< 32 chars) settings.
   Tests incl. wrong length, unicode, missing setting.
3. `src/shelf.js` (spike part): filter EPUB/PDF, size limit check, "file is in the folder" check.
   Tests with fake file objects.
4. `src/pages.js` (spike part): list, confirm, sent, error and diag pages; HTML escaping;
   `target="_top"` links; a `<base target="_top">`. Tests: escaping of `<b>&"'`, token present in
   links, no token on the error page.
5. `src/Code.js` + `src/sender.js`: `doGet`/`doPost` routing with fake services in tests; mail
   built with the file blob, subject = file name; errors mapped to plain messages without the
   address.
6. Deploy tooling (per decision 1) and `docs/setup-phase1.md`: click-by-click steps for the owner.
7. Owner runs E1–E8 on the real Kindle; Claude verifies with read-only checks (Apps Script
   executions log screenshot from the owner, Kindle library). Results go into `docs/spec.md`.
8. Security review (security-auditor agent) of the token check, the folder check and mail sending,
   because the spike is reachable on the internet. Fix must-fix items with tests.

## The owner's steps (preview; exact steps come in `docs/setup-phase1.md`)

1. Amazon → Manage Your Content and Devices → Preferences → Personal Document Settings → add the
   sending Gmail address to the Approved Personal Document E-mail List.
2. Make a Drive folder `ShelfDrop test` with 3–4 public-domain books (an EPUB, a PDF, a large PDF).
3. Sign in to Google in your own browser when clasp or the Apps Script editor asks; authorise the
   two scopes.
4. In the Apps Script editor → Project Settings → Script Properties: set `FOLDER_ID`,
   `KINDLE_EMAIL` and `ACCESS_TOKEN` (a long random value Claude's script generates on your PC,
   shown only to you, never committed).
5. Deploy as web app; bookmark the link on the Kindle; run the experiments.

## Decisions for the owner

1. **Deploy tool:** `clasp` from this repo (recommended: repeatable, the code in git is exactly
   what runs) or copy-paste into the online Apps Script editor.
2. **Sending account:** your main Gmail (recommended: simplest, one sign-in) or a separate Gmail
   created only for ShelfDrop.
3. **Send flow:** volume → confirm page with a "Send" button (recommended: no accidental sends, and
   a POST can't be triggered by link prefetching) or one tap sends immediately.
4. **Spike books:** a separate `ShelfDrop test` folder with public-domain books (recommended: the
   spike never touches your real shelf) or a copy of a few of your own books.

## Decisions made (2026-11-24)

1. **Deploy:** clasp from the repo.
2. **Sending account:** a **separate Gmail** used only for ShelfDrop. Consequences:
   - The Apps Script project lives in that account and runs as it; clasp signs in to it (the owner
     signs in in Brave).
   - That Gmail address goes on Amazon's approved sender list.
   - The bookshelf stays in the owner's main Drive and is **shared read-only (Viewer)** with the
     separate account; the script reads it by folder ID. E8 also checks that a shared folder works
     with the `drive.readonly` scope.
3. **Send flow:** volume → confirm page → "Send" button (POST).
4. **Spike books:** a separate `ShelfDrop test` folder with public-domain EPUBs and PDFs.

## Result

_To be filled in after the experiments._
