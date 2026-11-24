# ShelfDrop

Your Google Drive is your bookshelf. In your Kindle's web browser, open one private bookmarked page,
tap a series, tap a volume, and the book arrives in your Kindle library a minute or two later
through Amazon's **Send to Kindle**.

- Runs as a **Google Apps Script web app** in a Google account of your own: no server, no cost.
- No jailbreak and no changes to the Kindle. You never sign in to Google on the Kindle.
- The page is protected by a long secret token in its link. You can change the token at any time.
- ShelfDrop only **reads** your Drive folders. It never moves, renames or deletes your files.
- Each account's main folder by its own name, then its series, volumes in natural order (Vol 2
  before Vol 10) and loose books, and "✓ sent <date>" on every book you have sent.
- EPUB and PDF only, up to 25 MB (Gmail's limit), at most 15 books a day. Amazon receives a copy of
  every book you send (that is how Send to Kindle works).

Status: **1.0.0**, in daily use on a Kindle Paperwhite 5. See [CHANGELOG.md](CHANGELOG.md).

## Set it up

Follow **[docs/setup.md](docs/setup.md)**: from nothing to a bookmark on your Kindle in about an
hour. It also covers updating, changing the token, going back to an earlier version and
troubleshooting.

## How it works

```
Kindle browser ──(private link with token)──► Apps Script web app (your ShelfDrop Google account)
                                                 │ reads   shared Drive folders "Books/<series>/<volume>.epub"
                                                 │ emails  the file to yourname@kindle.com
                                                 ▼
                                     Amazon Send to Kindle ──► Kindle library
```

The page is plain server-rendered HTML for the Kindle's e-ink browser: large tap targets, black on
white, no JavaScript needed. The app asks Google for two permissions only: read-only Drive and send
mail. Settings (the folder IDs, the Kindle address, the token) live in the Apps Script project's
Script Properties, never in the code. Design, phases and results: [docs/spec.md](docs/spec.md).

## Repository layout

| Path              | What it is                                                       |
| ----------------- | ---------------------------------------------------------------- |
| `src/`            | The Apps Script code (uploaded to Google with `clasp`)           |
| `tests/`          | Node tests (`node:test`) for the logic in `src/`, with fake data |
| `tools/`          | `npm run deploy` and `npm run token`                             |
| `docs/setup.md`   | The setup guide                                                  |
| `docs/`           | Intent, spec, phase plans and the old phase guides               |
| `.claude/agents/` | Claude helpers (the Kindle page UI designer)                     |
| `.github/`        | CI, security scans, CodeQL, Dependabot                           |

## Develop

Needs Node 22 or newer.

```powershell
npm ci
```

```powershell
npm run check
```

`npm run check` runs `npm run lint` (ESLint with security rules, Prettier), `npm test` and
`npm run audit`. `npm run format` fixes formatting. There is no build step: the files in `src/` are
the app, and `npm run deploy` uploads and deploys them (see the guide).

Optional but recommended, the pre-commit hooks (needs [uv](https://docs.astral.sh/uv/)) (gitleaks, private-key check, lint, tests, audit):

```powershell
uv tool install pre-commit
```

```powershell
pre-commit install
```

Tests never use real books, Drive folders, Kindle addresses or tokens. A test
(`tests/repo-hygiene.test.js`) fails if a real Kindle address or token ever appears in the repo, and
another (`tests/docs.test.js`) checks that the commands, links, settings, messages and limits named in
this README and the guide match the code.

## License

[MIT](LICENSE).
