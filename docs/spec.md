# Spec: ShelfDrop, V1

Intent (confirmed 2026-11-24): [docs/intent/shelfdrop.md](intent/shelfdrop.md).

## Objective

From the Kindle Paperwhite 5's browser, the owner opens one bookmarked private link, taps a series,
taps a volume, and the book (EPUB or PDF from their Google Drive) arrives in the Kindle library
through Send to Kindle within about 2 minutes. No Google sign-in on the Kindle, no server, no cost,
no changes to the Kindle. ShelfDrop only reads Drive.

## Architecture

```
Kindle browser
  │  GET  https://script.google.com/macros/s/<deployment>/exec?t=<token>[&s=<seriesId>]
  │  POST same URL (t, f=<fileId>)  ← the "Send" button
  ▼
Apps Script web app (owner's Google account, "execute as me", access "anyone")
  ├─ checks the token (constant-time) → wrong/missing token: a blank "not found" page
  ├─ reads the bookshelf folder (DriveApp, read-only scope)
  ├─ renders plain HTML (HtmlService, no JavaScript needed)
  ├─ sends the file as an attachment to KINDLE_EMAIL (MailApp, send-only scope)
  └─ records "sent <date>" per file ID (PropertiesService)
  ▼
Amazon Send to Kindle (sender must be on the approved list) → Kindle library
```

### Parts

| Part     | File (planned)        | Responsibility                                                                                       |
| -------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| Entry    | `src/Code.js`         | `doGet`/`doPost`, routing, thin adapters around Apps Script APIs                                     |
| Settings | `src/settings.js`     | Read and validate Script Properties (`FOLDER_ID`, `KINDLE_EMAIL`, `ACCESS_TOKEN`)                    |
| Access   | `src/access.js`       | Token check (constant-time, minimum length)                                                          |
| Shelf    | `src/shelf.js`        | Series/volume model, natural sort, EPUB/PDF filter, size limit, "file is inside the bookshelf" check |
| Pages    | `src/pages.js`        | HTML for series list, volume list, confirm, result and error pages; escapes every name               |
| Sender   | `src/sender.js`       | Builds and sends the mail; maps failures to clear messages                                           |
| Sent log | `src/sentlog.js`      | Reads/writes the "sent" marks                                                                        |
| Manifest | `src/appsscript.json` | V8 runtime, web app settings, least-privilege OAuth scopes                                           |

### Limits that shape the design (to be confirmed in the phase 1 spike)

- **Attachment size:** Send to Kindle accepts e-mails up to 50 MB, but Apps Script's MailApp sends
  through Gmail, whose limit is **25 MB per message**. So the practical limit is about 25 MB, not
  the 50 MB in the intent. Files over the limit are shown as "too big" (as the intent says). Phase 1
  measures the real limit.
- **Daily mail quota:** a personal Google account can send to about 100 recipients a day through
  Apps Script. One book is one recipient, which is plenty for one reader.
- **Execution time:** 6 minutes per request. Fetching and mailing a 25 MB file should take seconds.
- **Web app framing:** HtmlService pages are served inside a sandboxed iframe from
  `*.googleusercontent.com`, and personal accounts show a "created by a Google Apps Script user"
  banner. Links and forms must target the top window (`target="_top"`). Whether the Kindle browser
  handles this is the riskiest assumption.

## Phases (riskiest first)

| Phase        | Goal                                                                                                                                                            | Proves / delivers                                                                                                                                                                                                                  | Version |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1. Spike     | A minimal deployed web app: token check, flat list of one test folder, confirm page, send                                                                       | That the Kindle browser can use an Apps Script page (iframe, top-window links, POST form); that Send to Kindle accepts MailApp attachments (EPUB, PDF, a ~20 MB file); real size limit; read-only Drive scope works; delivery time | 0.1.0   |
| 2. Shelf     | The real bookshelf: series → volumes, natural sort, loose books, EPUB/PDF filter, "too big" mark, Kindle-friendly design (UI designer agent), clear error pages | The everyday flow on the owner's real shelf                                                                                                                                                                                        | 0.2.0   |
| 3. Hardening | "✓ sent <date>" marks, token rotation steps, a daily send cap, safe error messages (no addresses or IDs shown), security review                                 | Safe to leave running                                                                                                                                                                                                              | 0.3.0   |
| 4. Release   | Setup guide (Amazon approved sender, Script Properties, clasp deploy, bookmark), deploy script, README, publishing checklist if the owner wants it on GitHub    | 1.0.0 the owner set up from the guide                                                                                                                                                                                              | 1.0.0   |

Each phase has its own `docs/phaseN-plan.md`, branch `phase-N-<name>`, and a result section below.

## Tech stack

- Google Apps Script, V8 runtime. Plain JavaScript, no runtime npm packages.
- Deployment with `@google/clasp` (decision in phase 1).
- Dev only: Node 22+, `node:test`, ESLint 10 + eslint-plugin-security, Prettier 3.

## Commands

```
npm ci              # install dev tools
npm run lint        # ESLint (+ security rules) and Prettier check
npm test            # node --test "tests/**/*.test.js"
npm run audit       # npm audit --audit-level=moderate
npm run check       # all three
npm run format      # fix formatting
```

npm run clasp -- login # owner signs clasp in to the ShelfDrop Google account
npm run clasp:init -- <id> # writes the git-ignored .clasp.json
npm run deploy # clasp push + deploy, same web app URL each time
npm run --silent token | clip # new ACCESS_TOKEN to the clipboard

## Project structure

```
src/            Apps Script code (one global scope; each file also exports for Node tests)
tests/          node:test tests with fake data and fake Apps Script services
docs/intent/    confirmed intent
docs/           spec, phase plans, setup guide
.claude/agents/ kindle-ui-designer
.github/        CI, security, CodeQL, Dependabot
```

## Code style

```js
// src/shelf.js: pure logic, no Apps Script calls, tested in Node.
function compareNatural(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}
```

- All `src/*.js` files share one global scope (as in Apps Script); tests load them the same way
  with `tests/helpers/apps-script.js`.
- Pure functions for logic; Apps Script services only in thin adapters in `Code.js`, passed in as
  parameters so tests can use fakes.
- Every name from Drive is escaped before it goes into HTML.
- Prettier formatting, `eqeqeq`, no `eval`/`new Function`.

## Testing strategy

- Unit tests in Node for everything pure: token check, natural sort, filtering, size limit,
  "inside the bookshelf" check, HTML escaping, page rendering (snapshot-style checks on key parts).
- Adapter tests with fake `DriveApp`/`MailApp`/`PropertiesService` objects.
- Independent check: the rendered HTML is also loaded in a real browser engine (headless Edge, via
  the UI designer agent) to confirm it renders and links target the top window.
- Real-world tests by the owner on the Kindle, with exact steps; results recorded below.
- A test for every bug found. `tests/repo-hygiene.test.js` keeps Kindle addresses out of the repo.

## Boundaries

- **Always:** run lint and tests after every change; escape Drive names; check the token before any
  Drive access; check a requested file is inside the bookshelf folder before sending it; keep
  settings in Script Properties.
- **Ask first:** adding OAuth scopes; changing web app access settings; adding dependencies;
  changing CI; anything that would write to Drive.
- **Never:** commit or log the Kindle address, token or clasp files; move, rename, trash or edit
  Drive files; use the owner's real books, Drive, address or token in tests; handle the owner's
  passwords; push to GitHub without being asked.

## Success criteria (V1)

1. On the Kindle, opening the bookmark shows the series list within about 5 seconds.
2. Tapping a series shows its volumes in natural order; tapping a volume and "Send" shows a
   "sent" confirmation, and the book appears in the Kindle library within about 2 minutes.
3. EPUB and PDF both arrive and open; other formats are not listed; files over the limit are marked
   "too big" and cannot be sent.
4. A wrong or missing token shows no book names and sends nothing.
5. A file ID outside the bookshelf folder is refused.
6. Changing `ACCESS_TOKEN` makes the old link stop working at once.
7. Nothing in Drive is ever changed.
8. Lint, tests, CodeQL and the security scans are green.

## Out of scope (deferred)

- Direct downloads to the Kindle (fragile on the Kindle browser).
- MOBI/AZW3/other formats, conversion or shrinking of files.
- Nested subfolders inside a series.
- Multiple users, PIN, Google sign-in on the Kindle.
- Reading progress or sync beyond the "sent" mark.
- Search box (maybe V2 if the shelf grows large).

## Open questions

- Phase 1 decisions: see [docs/phase1-plan.md](phase1-plan.md).
- Phase 3: the daily send cap (suggest 20 a day) and whether a "sent" mark can be cleared.

## Results

_Recorded per phase as they are done._
