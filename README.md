# ShelfDrop

Your Google Drive is your bookshelf. On your Kindle's web browser, open one private bookmarked page,
tap a series, tap a volume, and the book arrives in your Kindle library a minute or two later through
Amazon's **Send to Kindle**.

- Runs as a **Google Apps Script web app** in your own Google account: no server, no cost.
- No jailbreak and no changes to the Kindle. You never sign in to Google on the Kindle.
- The page is protected by a long secret token in its link. You can change the token at any time.
- ShelfDrop only **reads** your Drive folder. It never moves, renames or deletes your files.
- EPUB and PDF only. Amazon receives a copy of every book you send (that is how Send to Kindle works).

> Status: **pre-alpha**. The foundation is in place. Phase 1 (a spike that proves the Kindle browser
> and Send to Kindle work with this design) is planned in [docs/phase1-plan.md](docs/phase1-plan.md).
> See [docs/spec.md](docs/spec.md) for all phases.

## How it works

```
Kindle browser ──(private link with token)──► Apps Script web app (your Google account)
                                                 │ reads   Drive folder "Books/<series>/<volume>.epub"
                                                 │ emails  the file to yourname@kindle.com
                                                 ▼
                                     Amazon Send to Kindle ──► Kindle library
```

## Repository layout

| Path              | What it is                                                         |
| ----------------- | ------------------------------------------------------------------ |
| `src/`            | The Apps Script code (pushed to Google with `clasp`, from phase 1) |
| `tests/`          | Node tests (`node:test`) for the logic in `src/`, with fake data   |
| `docs/intent/`    | The confirmed statement of intent                                  |
| `docs/spec.md`    | Spec, phases and results                                           |
| `.claude/agents/` | Claude helpers (the Kindle page UI designer)                       |
| `.github/`        | CI, security scans, CodeQL, Dependabot                             |

## Install the dev tools

Needs Node 22 or newer.

```powershell
npm ci
```

Optional but recommended, the pre-commit hooks (gitleaks, private-key check, lint, tests, audit):

```powershell
uv tool install pre-commit
pre-commit install
```

## Lint, test, audit

```powershell
npm run lint
npm test
npm run audit
```

`npm run check` runs all three. `npm run format` fixes formatting.

## Build and deploy

There is no build step: the files in `src/` are the app. Deploy to your Google account with
[clasp](https://github.com/google/clasp) (run pinned through `npx`):

```powershell
npm run clasp -- login
npm run clasp:init -- <ScriptId>
npm run deploy
```

The full first-time setup is in [docs/setup-phase1.md](docs/setup-phase1.md).

## Settings (never in the repo)

These live in the Apps Script project's **Script Properties**, set by you in the Apps Script editor:

| Property       | Meaning                                             |
| -------------- | --------------------------------------------------- |
| `FOLDER_ID`    | The Drive folder that is your bookshelf             |
| `KINDLE_EMAIL` | Your Send to Kindle address (`yourname@kindle.com`) |
| `ACCESS_TOKEN` | The long random secret in your bookmarked link      |

A test (`tests/repo-hygiene.test.js`) fails if a real Kindle address ever appears in the repo.
