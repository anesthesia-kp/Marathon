# Marathon Tracker App — Handoff

Last updated: 2026-10-21 (rewritten from the actual code at commit 600db19 — the previous version still described the pre-Firebase app)

## What this project is

A personal marathon-training tracker. Started as a Google Sheet, now a single-file web app on GitHub Pages backed by Firebase.

- **Live site:** https://anesthesia-kp.github.io/Marathon/
- **Repo:** `anesthesia-kp/Marathon` (public, by the user's choice) — the only repo for this project. Local clone: `/Users/aaronfrankel/Documents/GitHub/Marathon` on the user's Mac.
- **Firebase project:** `marathon-training-3fb9e` (dedicated to this app — not shared with the user's Vacation Auction project). Firestore + Google Sign-In, live.
- **Original plan source:** Google Sheet `1JQWTKwDMEHYLp5vLN6Z49JV4HGeSJYUb`. The app was seeded from it on 2026-10-19; the two are **not** kept in sync — the app is now where the plan is edited.
- **Owner/user:** not a coder — simple explanations, high-quality code, honest pushback rather than agreement. Doesn't want to approve every small decision.

## Working agreements (every session)

- Start by reading this file and `DECISIONS.md` from disk, in full.
- When a build is ready to push, paste the commit message in chat as **one line only**. The user pushes via **GitHub Desktop** — this environment has no push credentials.
- Log durable build decisions in `DECISIONS.md` as they are made, not only in chat.
- At the end of the session, update this file, then paste the session-start prompt (`START_HERE_PROMPT.md`) back into chat and point to this file, so the next session is easy to start.

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

1. **Runs within a week are in random order.** Firestore returns runs in document-ID order (random), and nothing sorts them by date — so run order inside a week can look shuffled, and the "week ending" date (taken from the last run in the list) can be wrong.
2. **"Today" is computed in UTC.** After 5 pm Pacific (4 pm in winter) the app thinks it's tomorrow, so that day's runs show "past due" a day early.
3. **Deleting a shoe breaks edits to runs tagged with it.** Those runs still point at the deleted shoe; any later change to their actual miles or done box tries to adjust a shoe that no longer exists, Firestore rejects the whole write, and the edit silently doesn't save.
4. **Write failures are silent.** Run/shoe/settings writes have no error handling, so a failed save gives no message.
5. Planned/actual mile tiles show unrounded numbers (could display e.g. 671.9999999 after decimal edits).

## Known environment gotchas (learned the hard way — don't rediscover these)

- **Git push**: no GitHub credentials in this environment — `git push` always fails. Prepare the commit; the user pushes via GitHub Desktop.
- **Git lock files**: the connected-folder repo sometimes leaves stale `.lock` / `tmp_obj_*` files that can't be deleted until delete permission is requested for the folder (dedicated permission tool) — request it, then `rm -f`.
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
