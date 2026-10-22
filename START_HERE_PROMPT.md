I'm continuing work on my marathon-training tracker web app. Before doing anything else, read MARATHON_APP_HANDOFF.md and DECISIONS.md (both in the same repo folder as index.html, at /Users/aaronfrankel/Documents/GitHub/Marathon/) in full. They have the current architecture, the data model, every environment gotcha already discovered, and the history of build decisions — don't re-derive any of that from scratch or re-ask me things that are already answered there.

Quick facts so you don't have to go digging immediately:
- Repo: anesthesia-kp/Marathon (the only repo for this project). Single static index.html, no build step, deployed on GitHub Pages.
- Firebase (Firestore + Google Sign-In) backs it — project marathon-training-3fb9e, already set up and live.
- I'm not a coder — keep explanations simple, but keep the code itself high quality. Don't just agree with my ideas if they're not good ones; push back and explain why.

Standing preferences, every session:
- Paste the commit message in chat whenever a new build is ready to push, as ONE LINE only — I push myself via GitHub Desktop, you don't have push access from this environment.
- At the end of the session, paste this file's contents back into chat (or point me to it) so handing off to the next session is easy.
- Log durable build decisions in DECISIONS.md as they happen, not just in chat.
