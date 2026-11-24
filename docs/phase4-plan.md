# Phase 4 plan: release 1.0.0

Goal: someone could set ShelfDrop up from one guide, and the repo is ready to publish as 1.0.0.
Branch `phase-4-release`, version 1.0.0. Spec: [spec.md](spec.md), phase 4 row. No app behaviour
changes in this phase (one `checkSetup` log line changes after the review).

## Decisions made (2026-11-24)

1. **Token:** the owner already set a whole new token after phase 3 and deleted the old link
   document. Nothing to do.
2. **Guide shape:** a short **README** (what it is, how it works, dev commands) that links to one
   full guide, **`docs/setup.md`**, that someone can follow from nothing.
3. **Old guides** (`docs/setup-phase1..3.md`): **kept as history**, each with a note at the top
   pointing to `docs/setup.md`.
4. **Guide test: none hands-on.** Claude checks every command, link and step against the code (with
   a test that keeps the docs in step with `package.json`). Before the merge the owner redeploys the
   live app as 1.0.0 and checks that the bookmark still opens.
5. **License: MIT**, copyright "SocheatSorng" (the GitHub name).
6. **Personal details:** the Windows path in `docs/setup-phase2.md` becomes generic. Khmer and
   Cambodia stay (the time zone is a code setting; the guide says how to change it).
7. **Time zone:** no code change. The guide says which two lines to edit for another fixed-offset
   time zone (`LOCAL_UTC_OFFSET_MS` in `src/limits.js`, `timeZone` in `src/appsscript.json`).

## Tasks (thin slices, each: tests → change → lint → commit)

1. **Plan and version.** This file; version 1.0.0 in `package.json` and the lock file.
2. **Docs drift test** (`tests/docs.test.js`): every `npm run <script>` in the README and
   `docs/setup.md` exists in `package.json`; every relative link in them points to a real file;
   every Script Property the guide lists is one `src/settings.js` reads, and the reverse.
3. **`docs/setup.md`**, merged from the three phase guides: what you need; A. the ShelfDrop Google
   account; B. Amazon approved sender; C. the shelf folders (layout, sharing as Viewer, trust
   rules); D. install (clone, `npm ci`, clasp login, init, deploy); E. Script Properties
   (`FOLDER_ID`, `KINDLE_EMAIL`, `ACCESS_TOKEN`, `WEB_APP_URL`, optional `MAX_MB`); F. authorise
   and `checkSetup`; G. the link on the Kindle (`sendLinkToKindle`, bookmark); H. everyday use and
   limits; I. updating (deploy a new version, same URL); J. changing the token; K. rolling back;
   L. troubleshooting; M. standing rules; N. another time zone.
4. **Old guides:** a "historical" note at the top of each; the generic path in phase 2's.
5. **README for 1.0.0:** status, features, how it works, link to the guide, dev commands, license.
6. **LICENSE (MIT)**, `"license": "MIT"` in `package.json`; **CHANGELOG.md** (0.1.0 to 1.0.0).
7. **Deploy script check** for a fresh setup: re-read `tools/clasp-deploy.js` against the guide
   (no `.clasp.json`, no `.deployment.json`, an existing `.clasp.json`); fix anything with a test.

   **Checkpoint A:** lint + tests + audit green.

8. **Review:** `agent-skills:code-reviewer` over `main..phase-4-release`, reading the guide as a
   newcomer (wrong steps, missing steps, anything that leaks a secret). No security-auditor run: no
   code touching the token, mail or Drive changes. Fix the must-fix items.
9. **Publishing scan:** every unpushed commit and file for personal details (Kindle address, token,
   e-mail, Windows user name, folder or script IDs); the repo-hygiene test.

   **Checkpoint B:** lint + tests + audit green; review fixed; scan clean.

10. **Owner:** redeploy as 1.0.0 (`git switch --detach phase-4-release`, `npm run deploy`,
    `git switch main`), check the bookmark opens. Merge to `main` with `--ff-only` on the owner's
    yes, re-run checks on `main`, tag `v1.0.0` locally. The owner pushes `main` and the tag.

## Review (2026-11-24)

`agent-skills:code-reviewer`, read-only, over `main..phase-4-release`, reading the guide as a
newcomer against `src/` and `tools/`. Verdict: approve; no must-fix items. Fixed:

- The lost-`.deployment.json` recovery now rebuilds the file from `WEB_APP_URL` (same URL, same
  bookmark) and warns never to undeploy `@HEAD`. clasp 3.4.1 still has `deployments`/`undeploy`.
- The list limits are the real ones (300 books, 100 folders, 40 volume folders), with the page's
  note quoted.
- Part I: commit a time zone change before `git pull`. Part M points at part L for old `_sent:`
  marks, and `checkSetup`'s "nearly full" line now points at the guide instead of "ask Claude"
  (the only `src/` change this phase; tested).
- `tests/docs.test.js` also checks the messages the guide quotes and the limits it names against
  the code's constants (each checked by breaking the guide once); the README says exactly that.
- Nits: the token is in the Kindle browser's history (it is in every link); clipboard sync sends
  the token to the Microsoft account; uv is needed for the pre-commit hooks.

Left: the `v1.0.0` tag must be pushed with `main`, or part K's example fails for people who clone.

## Publishing scan (2026-11-24)

All 41 unpushed commits: author and committer are the noreply address; no Kindle address, token,
deployment ID or e-mail address. One item: the phase 2 guide held the owner's Windows
path. At the owner's request the unpushed history (82ad185 onwards) was rewritten so no commit holds it;
each rewritten commit differs from the old one only in that file, and `main` moved to the rewritten
phase 3 commit. gitleaks is not installed on this PC; the
`security.yml` workflow runs it on push.
