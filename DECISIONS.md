# Marathon Tracker — Decisions Log

Durable decisions about how this app is built, in roughly chronological order. Add to this as new decisions get made — newest at the bottom.

## Architecture

- **Single static `index.html`, no build step.** Deployed straight to GitHub Pages. Firebase JS SDK v13.0.0 loaded as ES modules from the gstatic CDN.
- **New, dedicated Firebase project** (`marathon-training-3fb9e`) rather than reusing one from another project. Google Sign-In only (no email/password). Firestore holds all data under `users/{uid}/...`, with security rules restricting each user to their own subtree.
- **Security rules published (2026-10-21).** No rules had ever been published before this date (the database was relying on its creation defaults). The user published the per-user rules; verified live that reads without sign-in are refused (403) and the signed-in app still works. The console copy and the comment in `index.html` must stay identical.
- **Multi-cycle support**: training blocks (cycles) can be archived and restored, not just one single plan forever.

## Schedule layout

- Completed weeks collapse into a sidebar on the right, expandable on demand — they don't clutter the main view.
- The current week is pinned at the top of the main column; upcoming weeks scroll below it.
- "Current week" is whichever week (by ascending week number) has an unfinished run in it — not based on today's date, so it stays correct even if the user falls behind or works ahead.
- Specific dates show next to each run's checkbox.
- **Run row layout (2026-10-21, user's spec):** the label reads "<planned> mi <style>" (e.g. "12 mi Quality") and the separate "x mi plan" text is gone; the actual-miles box sits right beside the shoe dropdown; completed runs are faded but **not crossed out**. Edit mode keeps its planned-miles box (that's where the plan is changed).
- **All notes cleared (2026-10-21, user's request).** All 77 notes were exact copies of the Sheet's descriptions (none typed in the app), so nothing unique was lost — the Sheet still has them. The legacy `desc` field was deleted from every run at the same time, since the desc→notes migration would otherwise have refilled the notes on the next load.
- Runs inside a week are listed in date order (then a fixed tiebreak), and the "week ending" date is the week's latest run date (2026-10-21; previously runs came out in database-ID order and the end date could be wrong).
- **No past-due flag** (2026-10-21) — the user doesn't want one; removed entirely.
- Checking a run's checkbox auto-fills its actual miles with the planned miles (still editable). Unchecking it clears that auto-filled value back out, and — since it's the same `updateRow` path as any other actual-miles edit — correctly reverses whatever shoe mileage had been added.

## Shoes

- 3 shoes tracked, each with a running mileage total kept in sync atomically with run edits/deletions/reassignments via Firestore batched writes (`increment()`).
- A default shoe can be set and is auto-applied to runs — but a `shoeAuto` flag distinguishes "auto-assigned by default" from "deliberately chosen by the user (including deliberately choosing none)," so changing the default shoe never silently overwrites a manual choice.

- **Deleting a shoe never rewrites history** (2026-10-21, user's call). Runs logged with a deleted shoe keep the tag (dropdown shows "Deleted shoe") and their miles; changing the default shoe never moves them onto the new default; and editing them still saves (all shoe-total bookkeeping goes through `addShoeDelta`/`applyShoeDeltas`, which skip shoes that no longer exist — before this, any edit to such a run failed silently because Firestore rejects updates to a deleted document).

## Run styles

- Replaced the free-text "session" field with a `<select>` of reusable styles (Long, Tempo, Easy, Quality, RACE to start, pulled from whatever was already in the seed plan). Picking "+ Add new style…" prompts for a name and saves it permanently (account-wide, in the `settings` doc) for every future run, not just the one being edited.

## Notes vs. description

- Removed the separate "description" field entirely — it was redundant with (and more limited than) a free-text notes field. Existing `desc` text is auto-migrated into `notes` the first time a user's data loads after this change (a one-time, idempotent migration that only touches rows with old-style `desc` and no `notes` yet — safe to run on every load).

## Reference tab

- Goal pace, the pace-zone table, the heart-rate-zone table, and the HR note are all editable in place from the Reference tab, backed by the `settings` doc (not hardcoded). Rows can be added or deleted. Goal pace editing lives here and drives the header subtitle everywhere else in the app.

## Visual

- Text darkened and enlarged for readability (contrast pushed further toward black in light mode; brightened slightly in dark mode — contrast is never reduced in dark mode to compensate).
- On narrow layouts (the sidebar, mobile), the run-row grid switches to a stacked layout rather than the normal 4-column grid, which would overlap at that width.
- The upcoming/completed scroll panels (fixed-height, internal scroll) are desktop-only; on mobile the whole page scrolls naturally instead, avoiding a scroll-within-a-scroll.

- Miles are displayed rounded to one decimal (stat tiles, shoe totals); stored values are not rounded (2026-10-21).
- Error text uses its own darker red (`--error-text`, #b3261e in light mode = 6.2:1; the old orange-red was 2.5:1, hard to read). Dark mode keeps #ec835a (7.4:1) (2026-10-21).

## Saving

- **Failed saves are never silent** (2026-10-21). Any failed save shows a red message with a Dismiss button that stays until dismissed (one `unhandledrejection` handler catches every save, since the app's click/typing handlers don't handle errors themselves). It's separate from the load-error message, which clears itself on the next good update.

## Process

- **Docs must move with the code (2026-10-21).** The handoff had gone stale across several builds (it still described the pre-Firebase app) and the old start prompt told new sessions to rebuild the live app from scratch. Now: every commit that changes `index.html` must update `MARATHON_APP_HANDOFF.md` in the same commit, including an `index.html fingerprint:` line (`git hash-object index.html`). Enforced by a pre-commit hook (`.githooks/pre-commit`, installed to `.git/hooks/pre-commit`), and checked at the start of every session.
- **Start prompt = the short session-start message (2026-10-21).** `START_HERE_PROMPT.md` now holds the user's own short start message plus the session checks and testing rules; the old long "build Firebase from scratch" prompt is retired.
- **Delete permission before git (2026-10-21).** Request delete permission on the repo folder at the start of each session, before any git command, so git can clean up its own lock files.
- **Testing rules adopted (2026-10-21).** Plan → build → verify for every change: plain-English plan first; automated tests saved in `tests/` and run before every commit; Playwright browser tests against a fake Firebase (never real data), desktop + phone sizes; data-integrity checks; axe-core accessibility check; basic load-speed check; security rules tested via the emulator only if it can run here, otherwise stated as untested; results reported as numbers. Full text lives in `START_HERE_PROMPT.md`. Adapted from a generic QA prompt the user supplied — the Next.js/TypeScript/API-route parts don't apply to this single-file app, and code/tests go in files rather than being pasted into chat.
- **Test kit design (2026-10-21).** Playwright (pinned 1.56.1 to match the cloud workspace's preinstalled Chromium) + axe-core. Firebase replaced by an in-memory fake in `tests/fake-firebase/`, routed in place of the gstatic CDN modules; all other network requests are blocked. Accessibility problems that already existed are listed per element in `KNOWN_A11Y` so only new ones fail. Each test also fails on any unexpected page/console error.
