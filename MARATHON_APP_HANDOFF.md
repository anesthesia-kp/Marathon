# Marathon Tracker App — Handoff

Last updated: 2026-10-21 (rewritten from the actual code — the previous version still described the pre-Firebase app)

index.html fingerprint: `9ee2a855b26746271f8d5dbbd21c4de2dc9d14e5`

(That line is the `git hash-object index.html` value of the code this file describes. If it doesn't match the current index.html, this file is out of date — stop and fix it from the code before doing anything else. A git hook blocks any commit that changes index.html without updating this line.)

## What this project is

A personal marathon-training tracker. Started as a Google Sheet, now a single-file web app on GitHub Pages backed by Firebase.

- **Live site:** https://anesthesia-kp.github.io/Marathon/
- **Repo:** `anesthesia-kp/Marathon` (public, by the user's choice) — the only repo for this project. Local clone: `/Users/aaronfrankel/Documents/GitHub/Marathon` on the user's Mac.
- **Firebase project:** `marathon-training-3fb9e` (dedicated to this app — not shared with the user's Vacation Auction project). Firestore + Google Sign-In, live.
- **Original plan source:** Google Sheet `1JQWTKwDMEHYLp5vLN6Z49JV4HGeSJYUb`. The app was seeded from it on 2026-10-19; the two are **not** kept in sync — the app is now where the plan is edited.
- **Owner/user:** not a coder — simple explanations, high-quality code, honest pushback rather than agreement. Doesn't want to approve every small decision.

## Session routine (every session)

**Start of session — before any other work:**
1. Read this file and `DECISIONS.md` from disk, in full.
2. Request delete permission for the repo folder **before the first git command** (the remote-devices delete-permission tool). Without it, every git command leaves `.lock` files behind that then block the user's GitHub Desktop.
3. Run `git status -sb` and `git hash-object index.html`. Compare the hash to the fingerprint at the top of this file. If they differ, this file is stale: tell the user first, then bring this file back in line with the code before building anything.
4. Check the docs guard is installed: `cmp .githooks/pre-commit .git/hooks/pre-commit`. If missing or different: `cp .githooks/pre-commit .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.

**During the session:**
- Follow the testing rules in `START_HERE_PROMPT.md` (plan → build → verify; tests saved in `tests/`; results reported as numbers).
- Log durable build decisions in `DECISIONS.md` as they are made, not only in chat.
- Every commit that changes `index.html` also updates this file in the **same commit**: whatever of "Current state", the data model and "Known issues" the change affects, plus the fingerprint line (`git hash-object index.html` after the final edit). The pre-commit hook refuses the commit otherwise. Never use `--no-verify`.
- When a build is ready to push, paste the commit message in chat as **one line only**. The user pushes via **GitHub Desktop** — this environment has no push credentials.

**End of session:**
- This file matches the code (fingerprint matches), `DECISIONS.md` is up to date, everything is committed, no `.lock` files left in `.git`.
- Paste the contents of `START_HERE_PROMPT.md` into chat, point to this file, and give the one-line commit message for anything not yet pushed.

## Current state (commit 600db19, pushed)

Single `index.html` (HTML + CSS + vanilla JS, no build step, no framework). Firebase JS SDK **v13.0.0** loaded as ES modules from the gstatic CDN (`firebase-app`, `firebase-auth`, `firebase-firestore`). Firebase config is inline in the script (not secret — the security rules are what protect the data).

### Features built
- **Sign-in:** Google Sign-In via popup. Signed-out screen → app shell. Same Google account = same data on phone and desktop.
- **Training cycles:** dropdown to switch between active cycles; "Manage cycles" panel to rename, set race date, create, archive, restore, or permanently delete (delete also reverses that cycle's shoe miles). Last-selected cycle is remembered per device in `localStorage` (`marathon-active-cycle-<uid>`) — the only thing still in localStorage.
- **Schedule tab:** current week pinned on top (= first week, by week number, with any unfinished run), upcoming weeks below, completed weeks collapsed in a right-hand sidebar (stacks below on mobile). Each run: checkbox + date, run style, past-due flag, shoe dropdown, notes, plan miles, actual miles. Checking a run fills actual = plan; unchecking clears it. Typing an actual marks it done.
- **Edit mode** ("Edit plan" button): every week shown in full; edit style (dropdown with "+ Add new style…", saved account-wide), plan miles, date; add/delete runs; add a week.
- **Stat tiles + overall progress meter** (runs done, % done, planned, actual, remaining).
- **Shoes tab:** add/rename/delete shoes, type a mileage directly, set a per-cycle default shoe (auto-applied to runs the user hasn't manually assigned — `shoeAuto` flag). Shoe totals move automatically and atomically with run edits.
- **Reference tab:** goal pace (drives the header subtitle), pace-zone table, max/rest HR, HR-zone table, HR note — all editable, rows can be added/deleted.
- **Export / import** of the active cycle as JSON (import replaces the cycle's runs, reversing their shoe miles first).
- Light/dark theme via CSS custom properties; responsive phone + desktop layout.

### Data model (Firestore) — as actually built
```
users/{uid}/cycles/{cycleId}
  name, raceDate ("YYYY-MM-DD" or ""), status ("active" | "archived"), createdAt, defaultShoeId (string | null)

users/{uid}/cycles/{cycleId}/runs/{runId}
  week (number), date ("YYYY-MM-DD" or ""), session (run style string), plan (miles), actual (miles | null),
  done (bool), notes (string), shoeId (string | null),
  shoeMilesApplied (miles this run currently contributes to its shoe's total — the bookkeeping that keeps shoe totals correct),
  shoeAuto (true = shoe came from the cycle default; false = user picked it, including picking "none")
  desc — legacy field from the Sheet; auto-copied into notes on load, no longer shown

users/{uid}/shoes/{shoeId}
  name, miles (the shoe's running total — directly editable AND auto-adjusted by runs via increment()), createdAt

users/{uid}/settings/{auto-id}      (exactly one doc per account)
  runStyles [string], goalPace, paceZones [{zone, pace, feel}], hrMax, hrRest, heartRateZones [{zone, bpm}], hrNote, createdAt
```
Note: the old handoff proposed `manualOffsetMiles` + computed totals for shoes. That is **not** what was built — shoes store one `miles` total that both the user and run edits change.

First sign-in on an empty account seeds: one cycle "Fall 2026 Marathon" (race 2026-12-06) from `SEED_PLAN` (weeks 1–28, 77 runs, 672 planned miles), three shoes ("Shoe 1–3"), and the settings doc.

**Security rules** (copy kept in the HTML comment at the top of `index.html`): read/write under `users/{uid}/**` only if `request.auth.uid == uid`.

## Known issues found 2026-10-21 (not yet fixed)

1. **Runs within a week aren't in date order.** Firestore returns runs in document-ID order, and nothing sorts them by date — so runs inside a week can appear out of order, and the "week ending" date (taken from whichever run happens to be listed last) can be wrong (e.g. week 22 can show Oct 20 instead of Oct 25).
2. **"Today" is computed in UTC.** After 5 pm Pacific (4 pm in winter) the app thinks it's tomorrow, so that day's runs show "past due" a day early.
3. **Deleting a shoe breaks edits to runs tagged with it.** Those runs still point at the deleted shoe; any later change to their actual miles or done box tries to adjust a shoe that no longer exists, Firestore rejects the whole write, and the edit silently doesn't save.
4. **Write failures are silent.** Run/shoe/settings writes have no error handling, so a failed save gives no message.
5. Planned/actual mile tiles show unrounded numbers (could display e.g. 671.9999999 after decimal edits).

## Known environment gotchas (learned the hard way — don't rediscover these)

- **Git push**: no GitHub credentials in this environment — `git push` always fails. Prepare the commit; the user pushes via GitHub Desktop.
- **Git lock files**: without delete permission on the connected folder, git can't remove its own `.lock` / `tmp_obj_*` files, and leftover ones (e.g. `.git/HEAD.lock`) block GitHub Desktop. Prevent it by requesting delete permission at the start of the session (Session routine step 2). If some are already there and no git is running: `rm -f .git/*.lock .git/objects/maintenance.lock .git/objects/*/tmp_obj_*`.
- **Docs guard hook**: the tracked copy is `.githooks/pre-commit`; the copy git actually runs is `.git/hooks/pre-commit` (not tracked — reinstall after a fresh clone, see Session routine step 4). It only acts on commits that change `index.html`. GitHub Desktop runs it too.
- **Clipboard paste into Google Sheets**: use `cmd+v`, not `ctrl+v` (Mac). `ctrl+v` triggers Sheets' "Enable copy/cut/paste?" dialog.
- **Artifact preview of this app**: strip the outer `<!doctype>/<html>/<head>/<meta>/<body>` tags before publishing (the Artifact tool wraps the page itself), and add a `:root[data-theme="dark"]` block alongside the `@media (prefers-color-scheme: dark)` block. Real Google sign-in from an Artifact page will only work if that page's domain is in Firebase Auth's authorized domains — untested, so expect to test sign-in on the live site instead.
- **CSS specificity (fixed, don't reintroduce)**: elements toggled with `[hidden]` that also have a `display:` rule need an explicit `X[hidden] { display: none; }` rule (see the combined rule under "controls" in the CSS), or they show when they should be hidden.
- **`device_commit_files` can look like it silently failed**: an immediate re-read can show stale content. Retry and re-verify before concluding anything is corrupt.
- GitHub Pages "Build and deployment" settings only appear for a public repo (or a paid plan for private). This repo is public.

## Files

- `index.html` — the whole app.
- `DECISIONS.md` — durable build decisions, newest at the bottom.
- `START_HERE_PROMPT.md` — the short message to start a new session.
- `MARATHON_APP_HANDOFF.md` — this file.
- `.githooks/pre-commit` — the docs guard (tracked copy; installed copy at `.git/hooks/pre-commit`).
