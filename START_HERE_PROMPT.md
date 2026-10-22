<role>
You are an expert Principal Software Engineer specializing in vanilla JavaScript, HTML5/CSS3, and Firebase (Firestore + Authentication), building static sites deployed on GitHub Pages with no build step. You write production-grade, highly readable, and performant code adhering strictly to industry best practices (e.g., SOLID principles, clean architecture) — but you also keep explanations of the code itself simple, since the person you're working with is not a coder. Do not agree with a bad idea just because it was suggested; say so and explain why.
</role>

<context>
I'm building a personal marathon-training tracker web app. It started as a Google Sheet and is now a single-file `index.html` (HTML + CSS + JS, no framework, no build step — required for GitHub Pages static hosting) deployed at https://anesthesia-kp.github.io/Marathon/, repo `anesthesia-kp/Marathon` (public).

Read `MARATHON_APP_HANDOFF.md` (delivered alongside this prompt) in full before doing anything else — it has the current app's feature set, the exact data shape, every environment gotcha already discovered (git push credentials, clipboard paste modifier key, Artifact publishing quirks, a CSS specificity bug already fixed), and the proposed Firestore data model. Don't re-derive any of that from scratch.

Current data model (to be migrated, not thrown away): a flat array of workout rows `{week, date, session, desc, plan, actual, done}`, persisted today in `localStorage` only (single device, no sync).

Decisions already made with the user — do not revisit these:
- A **new, dedicated Firebase project** for this app (not shared with their other GitHub Pages + Firebase project).
- **Google Sign-In** for auth (not anonymous auth) — required for the same account to see the same data on both phone and desktop.
</context>

<objective>
Migrate this app from localStorage to Firebase (Firestore + Google Sign-In), while adding:
1. Multiple saved training cycles, with the ability to archive an old cycle and pull it back up later.
2. Full in-app data entry/editing for everything currently only editable via the Google Sheet (so the Sheet can be retired as the source of truth).
3. Mileage tracking for 3 pairs of running shoes, with an editable distance per shoe (not just a read-only total).
4. All of the above in **one codebase** that already works on both mobile and desktop (the existing responsive layout already does this — preserve it, don't rebuild it).

Keep every existing feature working: edit mode, add/delete run, add week, mark done, log actual miles, light/dark theme, stat tiles + progress meter, export/import.
</objective>

<constraints>
- Must remain a single static HTML file (inline CSS + JS) — no bundler, no npm build step — because it deploys straight to GitHub Pages.
- Firebase JS SDK via CDN (modular v10+ API), not the old namespaced API.
- Firestore security rules must restrict every read/write to the signed-in user's own `uid` subtree — this is a single-user personal app, but the repo and site are public, so the data must not be publicly readable/writable.
- Don't lose the existing real training plan data (28 weeks, race day 2026-12-06) — it should become the first seeded cycle for the user's account on first sign-in, not be discarded.
- The user cannot push to GitHub from this environment — prepare the commit, then tell them one is waiting to be pushed via GitHub Desktop (do not attempt `git push` yourself and conclude failure means something is broken).
- Do not output lengthy explanations before the code; jump straight to the plan and implementation. Keep any necessary explanation of *why* something was built a certain way short and non-technical where possible.
</constraints>

<instructions>
1. Think step-by-step. First, output a brief technical <plan>: the Firestore collection/document structure you'll use (compare against the one already proposed in the handoff and say if you're deviating and why), the auth flow, and how you'll handle edge cases (first sign-in with no data yet, offline/slow network, a shoe with no runs linked to it yet, deleting a cycle vs. archiving it).
2. Set up the Firebase project itself (console: create project, enable Firestore, enable Google sign-in, register a web app for the config, publish security rules) before writing app code against it.
3. Inside a <code> block, provide the complete, fully updated `index.html`. Do not use placeholders or "TODO" comments — everything must be real, working code.
4. Inside a <verification> block, explain how to test this: what to check manually (sign in on two different devices/browsers and confirm the same data appears), and a couple of things to verify in Firestore's console directly (rules deny an unauthenticated read, a cycle survives an archive/restore cycle).
</instructions>
