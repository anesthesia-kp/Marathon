I'm continuing work on my marathon-training tracker web app. Before doing anything else, read MARATHON_APP_HANDOFF.md and DECISIONS.md (both in the same repo folder as index.html, at /Users/aaronfrankel/Documents/GitHub/Marathon/) in full. They have the current architecture, the data model, every environment gotcha already discovered, and the history of build decisions — don't re-derive any of that from scratch or re-ask me things that are already answered there.

Then do the start-of-session checks in the handoff's "Session routine" (delete permission before any git command, fingerprint check, hook check). If the handoff's index.html fingerprint doesn't match the code, tell me the handoff is out of date before doing anything else.

Quick facts so you don't have to go digging immediately:
- Repo: anesthesia-kp/Marathon (the only repo for this project). Single static index.html, no build step, deployed on GitHub Pages.
- Firebase (Firestore + Google Sign-In) backs it — project marathon-training-3fb9e, already set up and live.
- I'm not a coder — keep explanations simple, but keep the code itself high quality. Don't just agree with my ideas if they're not good ones; push back and explain why.

Standing preferences, every session:
- Paste the commit message in chat whenever a new build is ready to push, as ONE LINE only — I push myself via GitHub Desktop, you don't have push access from this environment.
- At the end of the session, paste this file's contents back into chat (or point me to it) so handing off to the next session is easy.
- Log durable build decisions in DECISIONS.md as they happen, not just in chat.
- Any commit that changes index.html must update MARATHON_APP_HANDOFF.md (and its index.html fingerprint) in the same commit. A git hook enforces this — never bypass it.

Testing rules: plan, build, verify. Every change.
1. Before coding: write a short plain-English plan covering what changes, edge cases, what could go wrong, and how each part will be tested. If it isn't clear enough what "done" means to write a test for it, ask me first.
2. Every code change comes with automated tests that prove it works. Save them in the repo's tests/ folder and run them before any commit. No placeholder tests and no "TODO" tests. Tests should click, type, and check what I'd actually see, not just compare the page's structure to a saved copy.
3. Test types, where they apply:
   - Browser tests (Playwright) of real things I do in the app, run on desktop and phone screen sizes. Firebase is swapped for a fake copy kept in tests/, so tests never touch my real data.
   - Data checks: shoe miles, cycle archive/restore, and import/export stay correct after every action.
   - Accessibility: an automated check (axe-core) on every tab, with no new serious problems allowed.
   - Load speed: a basic check.
   - Security rules: tested with Firebase's local test version (the emulator) if it can run here. If it can't, say so and never claim they were tested.
4. Report results as numbers, like "38 passed, 0 failed", never "looks good". Don't paste full code or test files into the chat; they live in the repo.
