# Marathon Tracker App — Handoff

Last updated: 2026-10-21

## What this project is

A personal marathon-training tracker, originally a Google Sheet, rebuilt as a single-file web app hosted on GitHub Pages.

- **Live site:** https://anesthesia-kp.github.io/Marathon/
- **GitHub repo:** `anesthesia-kp/Marathon` (public), local clone at `/Users/aaronfrankel/Documents/GitHub/Marathon` on the user's Mac
- **Source of truth for the training plan (original):** Google Sheet `1JQWTKwDMEHYLp5vLN6Z49JV4HGeSJYUb` ("Schedule", "Summary", "Reference" tabs) — the app's data has been re-seeded from this sheet but the two are no longer kept in sync automatically.
- **Owner/user:** not a coder — wants simple explanations, high-quality code, and does not want to be asked to approve every small decision; wants honest pushback, not agreement for agreement's sake.

## Current state (as of last session)

- The app is a **single `index.html` file** (HTML + CSS + vanilla JS, no build step, no framework) — this is required for GitHub Pages static hosting with zero deploy pipeline.
- Data model today: a flat array of workout rows (`{week, date, session, desc, plan, actual, done}`) seeded into the page as `SEED_PLAN`, stored/edited via **`localStorage`** (key `marathon-tracker-v2`). Single device only — nothing syncs.
- Features already built: responsive (phone + desktop) layout, light/dark theme via CSS custom properties, stat tiles + overall progress meter, tabbed Schedule/Reference views, an **edit mode** (toggle button) that lets the user add/delete runs and whole weeks, mark runs done, log actual mileage, export/import the plan as JSON, and a "start new block" / "reset to seed" action.
- Weeks 1–28 are seeded with the real training plan (race day 2026-12-06), matching the Google Sheet's current (corrected) date ordering — 77 rows, 672 planned miles.
- Deploy workflow: the sandboxed dev environment (Claude) can commit to the local git repo via a remote device bridge, but **has no GitHub push credentials** — the user must push every commit themselves via **GitHub Desktop**. There is one commit (`3c01e7d`, "Resync tracker with current Sheet") that may still be sitting unpushed locally — check `git status` / GitHub Desktop and push it if so, then confirm the live site shows 672 planned miles.
- An Artifact preview (claude.ai hosted page) has been used a couple of times to let the user test on their phone before deploying — this requires stripping the `<!doctype>/<html>/<head>/<body>` wrapper tags from `index.html` and adding a `:root[data-theme="dark"]` CSS block alongside the existing `@media (prefers-color-scheme: dark)` block (the Artifact tool supplies its own page skeleton).

## The in-flight request (not yet built)

The user wants to move well beyond the current localStorage version. Their request, verbatim:

> "I do want to make this an interactive site with memory that can easily be edited and data can be stored. I want to be able to save multiple training cycles and have things organized and clean. I need to be able to enter all info from spreadsheet and edit easily. I will use firebase if that would work. I want access for mobile and desktop, but just 1 set of code. I want to be able archive old training cycles, but be able to pull them up. I want miles tracking for 3 pairs of shoes and ability to edit that distance."

Decisions already made with the user:

- **New, dedicated Firebase project** (not shared with their other app, "Vacation Auction," which also runs on GitHub Pages + Firebase + Google login). Keeps personal training data separate from that other project's Google Cloud project/billing.
- Auth should be **Google Sign-In** (not anonymous auth) — this is a technical requirement, not just a preference: anonymous Firebase auth issues a different UID per browser/device, so it would NOT give the cross-device sync the user asked for ("access for mobile and desktop, but just 1 set of code"). Google Sign-In gives the same UID on any device once they sign in with their Google account, which is also the pattern their other app (Vacation Auction) already uses, so it should feel familiar.

### Proposed data model (Firestore) — not yet confirmed with user, but is the reasonable default

```
users/{uid}/cycles/{cycleId}
  name: string            e.g. "Fall 2026 Marathon"
  raceDate: "YYYY-MM-DD"
  status: "active" | "archived"
  createdAt: timestamp

users/{uid}/cycles/{cycleId}/runs/{runId}
  week: number
  date: "YYYY-MM-DD"
  session: string         e.g. "Quality" | "Easy" | "Long"
  desc: string
  plan: number (miles)
  actual: number | null
  done: boolean
  shoeId: string | null   -- optional link to a shoe (for auto mileage accumulation)

users/{uid}/shoes/{shoeId}
  name: string            e.g. "Nike Pegasus"
  manualOffsetMiles: number   -- miles not tracked via logged runs (pre-app miles, non-plan runs, corrections)
  -- displayed total miles = manualOffsetMiles + sum(actual miles of runs where shoeId == this shoe)
  active: boolean
```

Shoes are **global** (not per-cycle) since a shoe rotation outlives any one training block. The `manualOffsetMiles` field is what satisfies "ability to edit that distance" directly, on top of automatic accumulation from logged runs.

Firestore security rules should restrict all reads/writes to `request.auth.uid == {uid}` in the path (classic single-user-per-subtree pattern).

### Build plan (not started)

1. Create the new Firebase project (Firebase console), enable Firestore (in production mode) and enable the Google sign-in provider under Authentication.
2. Register a Firebase **web app** in that project to get the client config object (apiKey, authDomain, projectId, etc. — these are not secret, security comes from the Firestore rules + auth, not from hiding this config).
3. Write and publish Firestore security rules per the model above.
4. Rewrite `index.html`:
   - Add the Firebase JS SDK via CDN (modular v10+ syntax), initialize app + auth + Firestore.
   - Add a Google sign-in button / signed-out state.
   - Replace the localStorage read/write layer with Firestore `onSnapshot` listeners + writes, scoped under `users/{uid}/...`.
   - Add a cycle switcher (active cycles list + "new cycle" + archive/restore for old ones).
   - Add a shoes panel (3 shoe slots, editable name + manual offset, shows computed total).
   - Keep the existing edit-mode UI/UX for runs (add/delete run, add week, log actual, mark done) — just re-point its reads/writes at Firestore instead of the local array.
5. One-time migration: when a signed-in user has zero cycles in Firestore, seed their first cycle from the current `SEED_PLAN` (the real weeks 1–28 plan) so the existing training block isn't lost.
6. Test: Playwright for UI/logic that doesn't need real auth; for the real Google sign-in + Firestore round-trip, use Claude-in-Chrome against the published Artifact preview (the user's Chrome profile is already signed into their Google account, same technique used earlier to read/write the Google Sheet).
7. Publish an Artifact preview for the user to try on their phone, then commit to the local repo and have the user push via GitHub Desktop (same pattern as every previous deploy).

## Known environment gotchas (learned the hard way — don't rediscover these)

- **Git push**: the sandboxed dev environment's connection to the user's Mac has no GitHub credentials — `git push` always fails there. The user must push via **GitHub Desktop** every time; just prepare the commit and tell them one is waiting.
- **Git lock files**: the connected-folder git repo sometimes leaves stale `.lock`/`tmp_obj_*` files that can't be deleted until delete permission is explicitly requested for that folder (there's a dedicated permission-request tool for this) — request it, then clean up with `rm -f`.
- **Clipboard paste into Google Sheets from this environment**: use `cmd+v`, not `ctrl+v` (this is a Mac). `ctrl+v` triggers Sheets' "Enable copy/cut/paste?" dialog instead of pasting.
- **Artifact preview of this app**: must strip the outer `<!doctype>/<html>/<head>/<meta>/<body>` tags before publishing (Artifact wraps the page itself), and needs a `:root[data-theme="dark"]` block added alongside the `@media (prefers-color-scheme: dark)` block.
- **CSS specificity bug (already fixed, don't reintroduce)**: `[hidden]` attribute selectors on `.controls`/`.edit-hint` need their own rule (`.controls[hidden], .edit-hint[hidden] { display: none; }`) because `.controls { display: flex }` otherwise wins and shows destructive buttons outside edit mode.
- **`device_commit_files` can appear to silently fail**: an immediate re-read sometimes shows stale content due to a brief write-propagation delay. Retry and re-verify (don't conclude corruption) before escalating.
- GitHub Pages needs either a **public** repo or a paid plan for a **private** repo to show "Build and deployment" settings at all — this repo is public, by the user's explicit choice.

## Files worth knowing about

- Canonical current app source: `index.html` (same file delivered alongside this handoff, and mirrored at `/Users/aaronfrankel/Documents/GitHub/Marathon/index.html` on the user's Mac).
- This handoff + the paired "start here" prompt (`START_HERE_PROMPT.md`) are meant to let a fresh session pick up the Firebase migration without re-deriving any of the above.
