# Tests

Automated tests for `index.html`. Firebase is replaced by an in-memory fake (`fake-firebase/`), so the tests never touch real data and need no sign-in.

## Run them

```sh
cd tests
npm install               # first time only
npx playwright test       # app tests, desktop + phone sizes
sh pre-commit-hook.test.sh  # tests for the docs-sync git hook
```

Run the app tests against a different copy of the app (e.g. an older version, to prove a test catches a bug):

```sh
APP_FILE=/path/to/other/index.html npx playwright test
```

## What's covered

- `app.spec.mjs` — sign in/out and first-time setup; run order and "week ending" date; rounding; shoe mileage after every kind of run edit; deleting a shoe (history kept, edits still save); failed-save message; edit mode (add/delete run, new run style, new week); cycles (create, archive, restore, delete forever); export/import; layout on every tab at phone and desktop size; accessibility (axe-core, WCAG 2.1 A/AA, light and dark, with a list of problems that already existed); load speed. Every test also fails if the page logs an error it shouldn't.
- `pre-commit-hook.test.sh` — the guard that blocks committing `index.html` changes without updating the handoff.
- `fake-firebase/` — stand-ins for the three Firebase modules the app imports. Built to behave like real Firestore where the app depends on it (ID ordering, all-or-nothing batches, updating a missing document fails, increment, server timestamps).

## Not covered here

- The real Google sign-in popup and the real Firestore server.
- The Firestore security rules (see the handoff for status).
