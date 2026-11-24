# ShelfDrop: project instructions

Pick a book from a Google Drive folder on a Kindle Paperwhite's browser; a Google Apps Script web app
in the owner's account emails it to their Send to Kindle address. Intent: `docs/intent/shelfdrop.md`.
Spec and phases: `docs/spec.md`. One plan per phase: `docs/phaseN-plan.md`.

## Run, test, lint

- `npm ci` once. Then `npm run lint`, `npm test`, `npm run audit` (or `npm run check` for all three).
- No build step: `src/` is the app. Deploy: `npm run deploy` (clasp 3.4.1 via npx; not a project
  dependency because its own dependencies have known vulnerabilities). Owner's setup steps:
  `docs/setup-phase1.md`. Never run clasp yourself: it acts on the owner's Google account.
- After every code change: run lint and tests without being asked and report the result.

## Code rules

- `src/` is Apps Script V8: plain scripts sharing one global scope, no `import`/`export`, no npm
  packages at runtime. Tests load all of `src/` into one shared scope the same way
  (`tests/helpers/apps-script.js`), and ESLint learns the cross-file names from `src/`. Keep
  top-level code to `function` and `var` declarations (no top-level calls).
- Keep Apps Script calls (DriveApp, MailApp, PropertiesService, HtmlService) in thin adapter
  functions; keep logic (sorting, filtering, token check, HTML rendering) pure and tested in Node
  with fake data.
- The Kindle page: server-rendered HTML, works with no JavaScript, large tap targets, black on
  white (e-ink), no hover, no animation, small page weight. Escape every file and folder name.
- Least privilege OAuth scopes: Drive read-only, send-mail only (MailApp, not GmailApp).
- A test for every bug found.

## Never

- Never commit or log the Kindle address, the access token, `.clasp.json` or `.clasprc.json`.
  Settings live in Script Properties only.
- Never move, rename, trash or edit Drive files: ShelfDrop only reads.
- Never use the owner's real Drive, real books, real Kindle address or real token in tests or
  harnesses. The owner does real-world tests, with exact steps from Claude.
- Never ask for, type or handle the owner's passwords; the owner signs in in their own browser
  (Brave). Claude in Chrome can't drive Brave.
- Never push to GitHub unless the owner asks; before the first push follow the publishing checklist
  (personal-details scan, public/private question, noreply email).

## Workflow

Branch per phase (`phase-N-...`), small tested commits whose messages say why, merge to `main` with
`--ff-only` only on the owner's yes, then re-run lint and tests on main. Security review
(`agent-skills:security-auditor`) for anything touching the token, sending mail or Drive access;
UI pass with `.claude/agents/kindle-ui-designer.md` for the Kindle page.

Git identity for this repo: `SocheatSorng <55123731+SocheatSorng@users.noreply.github.com>`.
On Windows, write multi-line commit messages with Git Bash `git commit -F - <<'EOF'`, and never run
the bare `python` (Windows Store stub); use `node` for scripting.
