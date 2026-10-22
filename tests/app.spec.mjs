// Behavioral tests for index.html. Firebase is swapped for the in-memory fake
// in ./fake-firebase, so nothing here ever touches real data.
//
// Run:  cd tests && npm install && npx playwright test
// Run against another copy of the app:  APP_FILE=/path/to/index.html npx playwright test
import { test as base, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP_FILE = process.env.APP_FILE ? path.resolve(process.env.APP_FILE) : path.resolve(HERE, "..", "index.html");
const FAKE_DIR = path.join(HERE, "fake-firebase");
const APP_URL = "http://marathon.test/";
const UID = "test-user";

// Seed plan facts (weeks 1-28, from the Google Sheet).
const SEED = { runs: 77, done: 56, planned: 672, actual: 362 };
// Seed runs in weeks 19-21 that are ticked but have no actual miles (they count
// their planned miles toward a shoe): 18 + 19 + 7 + 10 + 13 + 6 + 6.
const TICKED_NO_ACTUAL_PLAN = 79;

/* ---------------- fixtures ---------------- */

const test = base.extend({
  // Answers for prompt()/confirm() dialogs, in order. Unqueued confirms are accepted.
  dialogs: [async ({ page }, use) => {
    const answers = [];
    const seen = [];
    page.on("dialog", async (d) => {
      seen.push({ type: d.type(), message: d.message() });
      const a = answers.length ? answers.shift() : undefined;
      if (d.type() === "prompt") {
        if (a === null) await d.dismiss();
        else await d.accept(a === undefined ? d.defaultValue() : String(a));
      } else if (a === false) {
        await d.dismiss();
      } else {
        await d.accept();
      }
    });
    await use({ answer: (...xs) => answers.push(...xs), seen });
  }, { auto: true }],
  // Fails any test that produces a page error or console error, unless the test opts out.
  errors: [
    async ({ page }, use) => {
      const list = [];
      page.on("pageerror", (e) => list.push("pageerror: " + e.message));
      page.on("console", (m) => m.type() === "error" && list.push("console: " + m.text()));
      const errors = { list, allow: false };
      await use(errors);
      if (!errors.allow) expect(list, "unexpected errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

async function openApp(page) {
  await page.route("**/*", (route) => route.abort()); // nothing may reach the real network
  await page.route("https://www.gstatic.com/firebasejs/13.0.0/*", (route) => {
    const file = path.join(FAKE_DIR, route.request().url().split("/").pop());
    route.fulfill({ path: file, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" } });
  });
  await page.route(APP_URL, (route) => route.fulfill({ path: APP_FILE, contentType: "text/html" }));
  await page.goto(APP_URL);
  await expect(page.locator("#signedOutView")).toBeVisible();
}

async function signIn(page) {
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  await expect(page.locator(".week-card.current-week")).toBeVisible();
}

async function start(page) {
  await openApp(page);
  await signIn(page);
}

/* ---------------- helpers ---------------- */

const weekCard = (page, week) =>
  page.locator(".week-card", { has: page.locator(".week-title", { hasText: new RegExp(`^Week ${week}(?!\\d)`) }) });

const runRow = (page, week, session) =>
  // A run's label reads "<planned> mi <style>", e.g. "7 mi Quality".
  weekCard(page, week).locator(".run-row", { has: page.locator(".run-session", { hasText: new RegExp(`^[\\d.]+ mi ${session}$`) }) });

const tile = (page, label) =>
  page.locator(".stat-tile", { has: page.locator(".stat-label", { hasText: label }) }).locator(".stat-value");

async function gotoTab(page, name) {
  await page.locator(".tab-btn", { hasText: name }).click();
}

async function setActual(row, value) {
  const input = row.locator(".actual-input");
  await input.fill(String(value));
  await input.press("Tab");
}

// Database reads (through the fake).
const db = {
  cycles: (page) => page.evaluate((uid) => window.__fakeFirestore.list(`users/${uid}/cycles`), UID),
  shoes: (page) => page.evaluate((uid) => window.__fakeFirestore.list(`users/${uid}/shoes`), UID),
  settings: (page) => page.evaluate((uid) => window.__fakeFirestore.list(`users/${uid}/settings`)[0], UID),
  runs: (page, cycleId) =>
    page.evaluate(({ uid, cycleId }) => window.__fakeFirestore.list(`users/${uid}/cycles/${cycleId}/runs`), { uid: UID, cycleId }),
};
async function firstCycleId(page) {
  const cycles = await db.cycles(page);
  return cycles.find((c) => c.name === "Fall 2026 Marathon").id;
}
async function dbRun(page, week, session) {
  const runs = await db.runs(page, await firstCycleId(page));
  return runs.find((r) => r.week === week && r.session === session);
}
async function shoeByName(page, name) {
  return (await db.shoes(page)).find((s) => s.name === name);
}
const shoeMiles = async (page, name) => Math.round(((await shoeByName(page, name))?.miles ?? NaN) * 1000) / 1000;

/* ---------------- tests ---------------- */

test("signing in shows the seeded plan; signing out hides it", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("#appShell")).toBeHidden();
  await signIn(page);
  await expect(page.locator("#userEmail")).toHaveText("runner@example.com");
  await expect(tile(page, "Runs completed")).toHaveText(`${SEED.done} / ${SEED.runs}`);
  await expect(tile(page, "Planned miles")).toHaveText(String(SEED.planned));
  await expect(tile(page, "Actual miles logged")).toHaveText(String(SEED.actual));
  await expect(tile(page, "Miles remaining")).toHaveText(String(SEED.planned - SEED.actual));
  await expect(page.locator("#overallCaption")).toHaveText(`${SEED.actual} mi of ${SEED.planned} mi logged`);
  expect((await db.shoes(page)).map((s) => s.name).sort()).toEqual(["Shoe 1", "Shoe 2", "Shoe 3"]);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("#signedOutView")).toBeVisible();
  await expect(page.locator("#appShell")).toBeHidden();
});

test("runs inside a week are in date order, and 'week ending' is the latest date", async ({ page }) => {
  await start(page);
  const current = page.locator(".week-card.current-week");
  await expect(current.locator(".week-title")).toContainText("Week 22");
  await expect(current.locator(".run-session")).toHaveText(["7 mi Quality", "11 mi Easy", "20 mi Long"]);
  await expect(current.locator(".week-sub")).toContainText("week ending Oct 25");

  // Move week 23's long run to the start of the week; order and end date follow.
  await page.getByRole("button", { name: "Edit plan" }).click();
  const longDate = weekCard(page, 23).locator('input.f-date[value="2026-11-01"]');
  await longDate.fill("2026-10-26"); // fill() fires the change event, which saves
  await expect.poll(async () => (await dbRun(page, 23, "Long")).date).toBe("2026-10-26");
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(weekCard(page, 23).locator(".run-session")).toHaveText(["13 mi Long", "6 mi Quality", "8 mi Easy"]);
  await expect(weekCard(page, 23).locator(".week-sub")).toContainText("week ending Oct 29");
});

test("run rows: '<miles> mi <style>', no separate plan text, actual box beside the shoe, not crossed out", async ({ page }) => {
  await start(page);
  const current = page.locator(".week-card.current-week");
  await expect(current.locator(".run-session").first()).toHaveText("7 mi Quality");
  // No separate "x mi plan" text anywhere on the schedule (outside edit mode).
  await expect(page.locator("#tab-schedule .run-row", { hasText: /plan/i })).toHaveCount(0);

  // The actual-miles box sits immediately to the right of the shoe dropdown, on the same line.
  const expectBesideShoe = async (row) => {
    const shoe = await row.locator(".shoe-select").boundingBox();
    const actual = await row.locator(".actual-input").boundingBox();
    expect(actual.x, "actual box is right of the shoe").toBeGreaterThanOrEqual(shoe.x + shoe.width);
    expect(actual.x - (shoe.x + shoe.width), "actual box is right next to the shoe").toBeLessThan(20);
    expect(Math.abs(actual.y + actual.height / 2 - (shoe.y + shoe.height / 2)), "same line").toBeLessThan(6);
  };
  await expectBesideShoe(runRow(page, 22, "Quality"));
  await page.locator(".wrc-head").first().click(); // expand the most recent completed week
  await expectBesideShoe(page.locator(".wrc-body .run-row").first());

  // Completed runs are not crossed out.
  const decoration = (loc) => loc.evaluate((el) => getComputedStyle(el).textDecorationLine);
  expect(await decoration(page.locator(".wrc-body .run-row.done .run-session").first())).toBe("none");
  await runRow(page, 22, "Quality").locator(".done-toggle").check();
  await expect(runRow(page, 22, "Quality").locator(".done-toggle")).toBeChecked();
  expect(await decoration(runRow(page, 22, "Quality").locator(".run-session"))).toBe("none");

  // With no shoes at all, the actual box is still there.
  await gotoTab(page, "Shoes");
  for (let i = 0; i < 3; i++) await page.locator(".shoe-card .delete-run-btn").first().click(), await expect(page.locator(".shoe-card")).toHaveCount(2 - i);
  await gotoTab(page, "Schedule");
  await expect(runRow(page, 22, "Easy").locator(".shoe-select")).toHaveCount(0);
  await setActual(runRow(page, 22, "Easy"), 11);
  await expect.poll(async () => (await dbRun(page, 22, "Easy")).actual).toBe(11);
});

test("mile totals show at most one decimal", async ({ page }) => {
  await start(page);
  for (const [session, miles] of [["Quality", 0.1], ["Easy", 0.2]]) {
    const row = runRow(page, 22, session);
    await row.locator(".shoe-select").selectOption({ label: "Shoe 1" });
    await expect.poll(async () => (await dbRun(page, 22, session)).shoeId).toBe((await shoeByName(page, "Shoe 1")).id);
    await setActual(runRow(page, 22, session), miles);
    await expect.poll(async () => (await dbRun(page, 22, session)).actual).toBe(miles);
  }
  await expect(tile(page, "Actual miles logged")).toHaveText(String(SEED.actual + 0.3));
  await expect(tile(page, "Miles remaining")).toHaveText(String(Math.round((SEED.planned - SEED.actual - 0.3) * 10) / 10));
  await gotoTab(page, "Shoes");
  await expect(page.locator(".shoe-card").first().locator(".shoe-total-value")).toHaveText("0.3 mi");
});

test("shoe miles follow every run edit", async ({ page, dialogs }) => {
  await start(page);
  const row = () => runRow(page, 22, "Quality");
  await row().locator(".shoe-select").selectOption({ label: "Shoe 1" });
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(0);
  await row().locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(7); // ticking fills actual = plan
  expect((await dbRun(page, 22, "Quality")).actual).toBe(7);

  await setActual(row(), 8);
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(8);

  await row().locator(".shoe-select").selectOption({ label: "Shoe 2" });
  await expect.poll(() => shoeMiles(page, "Shoe 2")).toBe(8);
  expect(await shoeMiles(page, "Shoe 1")).toBe(0);

  await row().locator(".done-toggle").uncheck();
  await expect.poll(() => shoeMiles(page, "Shoe 2")).toBe(0);
  expect((await dbRun(page, 22, "Quality")).actual).toBeNull();

  // Deleting a logged run takes its miles back off the shoe.
  await row().locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Shoe 2")).toBe(7);
  await page.getByRole("button", { name: "Edit plan" }).click();
  await weekCard(page, 22).locator('input.f-date[value="2026-10-20"]').locator("xpath=ancestor::div[contains(@class,'run-row')]").locator(".delete-run-btn").click();
  await expect.poll(() => shoeMiles(page, "Shoe 2")).toBe(0);
  expect((await db.runs(page, await firstCycleId(page))).length).toBe(SEED.runs - 1);
  expect(dialogs.seen.some((d) => d.type === "confirm" && d.message.includes("Delete"))).toBe(true);
});

test("deleting a shoe keeps run history, and those runs can still be edited", async ({ page }) => {
  await start(page);
  // Default shoe tags every run, including all past ones.
  await gotoTab(page, "Shoes");
  await page.locator("#defaultShoeSelect").selectOption({ label: "Shoe 1" });
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(SEED.actual + TICKED_NO_ACTUAL_PLAN);
  const shoe1Id = (await shoeByName(page, "Shoe 1")).id;

  await gotoTab(page, "Schedule");
  await runRow(page, 22, "Quality").locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(SEED.actual + TICKED_NO_ACTUAL_PLAN + 7);

  // Delete Shoe 1.
  await gotoTab(page, "Shoes");
  await page.locator(".shoe-card", { has: page.locator('input.shoe-name-input[value="Shoe 1"]') }).locator(".delete-run-btn").click();
  await expect(page.locator(".shoe-card")).toHaveCount(2);

  // History is untouched: runs keep their shoe tag.
  expect((await dbRun(page, 22, "Quality")).shoeId).toBe(shoe1Id);
  expect((await dbRun(page, 1, "Long")).shoeId).toBe(shoe1Id);
  await gotoTab(page, "Schedule");
  await expect(runRow(page, 22, "Quality").locator(".shoe-select option:checked")).toHaveText("Deleted shoe");

  // Editing those runs still saves (this used to fail silently).
  await runRow(page, 22, "Quality").locator(".done-toggle").uncheck();
  await expect.poll(async () => (await dbRun(page, 22, "Quality")).done).toBe(false);
  expect((await dbRun(page, 22, "Quality")).actual).toBeNull();
  expect((await dbRun(page, 22, "Quality")).shoeId).toBe(shoe1Id);
  await runRow(page, 22, "Quality").locator(".done-toggle").check();
  await expect.poll(async () => (await dbRun(page, 22, "Quality")).actual).toBe(7);
  await expect(page.locator("#saveError")).toBeHidden();

  // Picking a new default shoe doesn't move the deleted shoe's runs onto it.
  await gotoTab(page, "Shoes");
  await page.locator("#defaultShoeSelect").selectOption({ label: "Shoe 2" });
  await expect(page.locator("#defaultShoeSelect")).toHaveValue((await shoeByName(page, "Shoe 2")).id);
  await expect.poll(async () => (await db.cycles(page))[0].defaultShoeId).toBe((await shoeByName(page, "Shoe 2")).id);
  expect(await shoeMiles(page, "Shoe 2")).toBe(0);
  expect((await dbRun(page, 1, "Long")).shoeId).toBe(shoe1Id);
});

const shoeCard = (page, name) => page.locator(".shoe-card", { has: page.locator(`input.shoe-name-input[value="${name}"]`) });
const completedRow = (page, week, session) =>
  page.locator(".week-row-compact", { has: page.locator(`.wrc-head[data-week="${week}"]`) })
    .locator(".run-row", { has: page.locator(".run-session", { hasText: new RegExp(`^[\\d.]+ mi ${session}$`) }) });

async function editShoeTotal(page, name, value, { submit = "save" } = {}) {
  await gotoTab(page, "Shoes");
  await shoeCard(page, name).getByRole("button", { name: /Edit total/ }).click();
  const input = shoeCard(page, name).locator(".shoe-total-input");
  await expect(input).toBeFocused();
  await input.fill(String(value));
  if (submit === "enter") await input.press("Enter");
  else if (submit === "save") await shoeCard(page, name).getByRole("button", { name: "Save" }).click();
  return input;
}

test("Edit total sets a starting point; later ticks and unticks add or subtract from it", async ({ page }) => {
  await start(page);
  await gotoTab(page, "Shoes");
  await page.locator("#defaultShoeSelect").selectOption({ label: "Shoe 1" });
  // Ticked runs count actual miles, or planned miles when no actual was entered.
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(SEED.actual + TICKED_NO_ACTUAL_PLAN);

  await editShoeTotal(page, "Shoe 1", 169);
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(169);
  await expect(shoeCard(page, "Shoe 1").locator(".shoe-total-value")).toHaveText("169 mi");
  await expect(shoeCard(page, "Shoe 1").locator(".shoe-setpoint")).toContainText("Set to 169 mi");
  await expect(shoeCard(page, "Shoe 1").locator(".shoe-setpoint")).toContainText("no change since");
  expect((await shoeByName(page, "Shoe 1")).totalSetTo).toBe(169);

  // Tonight's real case: a run that was ticked (with no actual) when the total
  // was set gets unticked and re-ticked -- the total must end where it started.
  await gotoTab(page, "Schedule");
  await page.locator('.wrc-head[data-week="21"]').click();
  await completedRow(page, 21, "Long").locator(".done-toggle").click(); // unticking moves week 21 out of the completed column
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(169 - 13);
  // Week 21 is the current week again now; re-ticking completes it, so the app
  // moves it back to the completed column (click, then check the saved result).
  await runRow(page, 21, "Long").locator(".done-toggle").click();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(169);
  await expect(page.locator(".week-card.current-week .week-title")).toContainText("Week 22");
  expect((await dbRun(page, 21, "Long")).actual).toBe(13);

  // A run that was NOT ticked when the total was set adds its miles when ticked.
  await runRow(page, 22, "Quality").locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(176);
  await gotoTab(page, "Shoes");
  await expect(shoeCard(page, "Shoe 1").locator(".shoe-total-value")).toHaveText("176 mi");
  await expect(shoeCard(page, "Shoe 1").locator(".shoe-setpoint")).toContainText("+7 mi since");

  // A new total (saved with Enter) includes that run, so unticking it subtracts.
  await editShoeTotal(page, "Shoe 1", 200, { submit: "enter" });
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(200);
  await gotoTab(page, "Schedule");
  await runRow(page, 22, "Quality").locator(".done-toggle").uncheck();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(193);

  // Cancel, Escape and an empty value all leave the total alone.
  await editShoeTotal(page, "Shoe 1", 999, { submit: "none" });
  await shoeCard(page, "Shoe 1").getByRole("button", { name: "Cancel" }).click();
  await expect(shoeCard(page, "Shoe 1").locator(".shoe-total-value")).toHaveText("193 mi");
  const input = await editShoeTotal(page, "Shoe 1", "", { submit: "save" });
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.press("Escape");
  await expect(shoeCard(page, "Shoe 1").locator(".shoe-total-value")).toHaveText("193 mi");
  expect(await shoeMiles(page, "Shoe 1")).toBe(193);

  // Changing the planned miles of a ticked run with no actual moves the shoe too.
  await gotoTab(page, "Schedule");
  await page.getByRole("button", { name: "Edit plan" }).click();
  const plan20 = weekCard(page, 20).locator('input.f-plan[value="19"]');
  await plan20.fill("20");
  await plan20.press("Tab");
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(194);
  await page.getByRole("button", { name: "Done editing" }).click();

  // Clearing the actual on a ticked run falls back to its planned miles.
  await runRow(page, 22, "Easy").locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(205);
  await setActual(runRow(page, 22, "Easy"), 12);
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(206);
  const easyActual = runRow(page, 22, "Easy").locator(".actual-input");
  await easyActual.fill("");
  await easyActual.press("Tab");
  await expect.poll(async () => (await dbRun(page, 22, "Easy")).actual).toBeNull();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(205);
});

test("Edit total also covers runs in archived cycles", async ({ page, dialogs }) => {
  await start(page);
  await page.getByRole("button", { name: "Manage cycles" }).click();
  dialogs.answer("Spring 2027", "2027-04-01");
  await page.getByRole("button", { name: "+ New cycle" }).click();
  await expect(page.locator("#cycleSelect option:checked")).toHaveText("Spring 2027");
  await page.getByRole("button", { name: "Edit plan" }).click();
  dialogs.answer("1", "2027-01-03");
  await page.getByRole("button", { name: "+ Add a new week" }).click();
  const planInput = weekCard(page, 1).locator("input.f-plan");
  await planInput.fill("5");
  await planInput.press("Tab");
  await page.getByRole("button", { name: "Done editing" }).click();
  const row = page.locator(".week-card.current-week .run-row");
  await row.locator(".shoe-select").selectOption({ label: "Shoe 2" });
  await row.locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Shoe 2")).toBe(5);

  const springRow = page.locator(".cycle-row", { has: page.locator('input.cycle-name-input[value="Spring 2027"]') });
  await springRow.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator("#cycleSelect option:checked")).toHaveText("Fall 2026 Marathon");
  await editShoeTotal(page, "Shoe 2", 300); // the archived run is ticked -> included in 300
  await expect.poll(() => shoeMiles(page, "Shoe 2")).toBe(300);

  await springRow.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("#cycleSelect option:checked")).toHaveText("Spring 2027");
  await gotoTab(page, "Schedule");
  await page.locator(".week-card.current-week .run-row .done-toggle").uncheck();
  await expect.poll(() => shoeMiles(page, "Shoe 2")).toBe(295);
});

async function renameShoe(page, from, to) {
  await gotoTab(page, "Shoes");
  const input = page.locator(`.shoe-card:not(.retired) input.shoe-name-input[value="${from}"]`); // active shoes only
  await input.fill(to);
  await input.press("Tab");
}
const selectedShoeText = (row) => row.locator(".shoe-select option:checked");

test("retiring a shoe keeps its history, frees upcoming runs, and labels it with the date", async ({ page, dialogs }) => {
  await page.clock.setFixedTime(new Date("2026-10-22T05:30:00-07:00"));
  await start(page);
  await renameShoe(page, "Shoe 1", "Clifton 11");
  await expect.poll(async () => !!(await shoeByName(page, "Clifton 11"))).toBe(true);
  const oldId = (await shoeByName(page, "Clifton 11")).id;
  await page.locator("#defaultShoeSelect").selectOption({ label: "Clifton 11" });
  await gotoTab(page, "Schedule");
  await runRow(page, 22, "Quality").locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Clifton 11")).toBe(SEED.actual + TICKED_NO_ACTUAL_PLAN + 7);
  const milesAtRetirement = await shoeMiles(page, "Clifton 11");

  // Retire it.
  await gotoTab(page, "Shoes");
  await shoeCard(page, "Clifton 11").getByRole("button", { name: "Retire" }).click();
  await expect(page.locator(".retired-heading")).toBeVisible();
  await expect(page.locator(".shoe-card.retired")).toHaveCount(1);
  await expect(page.locator(".shoe-card:not(.retired)")).toHaveCount(2);
  await expect(page.locator(".shoe-card.retired")).toContainText("Clifton 11 (retired Oct 2026)");
  await expect(page.locator("#defaultShoeSelect option", { hasText: "Clifton 11" })).toHaveCount(0);
  await expect(page.locator("#defaultShoeSelect")).toHaveValue("");
  expect((await db.cycles(page))[0].defaultShoeId).toBeNull();
  expect(await shoeMiles(page, "Clifton 11")).toBe(milesAtRetirement); // miles kept

  // History: ticked runs keep the retired shoe, shown with its date; upcoming runs are freed.
  expect((await dbRun(page, 22, "Quality")).shoeId).toBe(oldId);
  expect((await dbRun(page, 1, "Long")).shoeId).toBe(oldId);
  expect((await dbRun(page, 22, "Easy")).shoeId).toBeNull();
  await gotoTab(page, "Schedule");
  await expect(selectedShoeText(runRow(page, 22, "Quality"))).toHaveText("Clifton 11 (retired Oct 2026)");
  await expect(selectedShoeText(runRow(page, 22, "Easy"))).toHaveText("No shoe logged");
  await expect(runRow(page, 22, "Easy").locator(".shoe-select option", { hasText: "retired" })).toHaveCount(0); // not offered for new runs

  // A new pair can reuse the name, and becoming the default doesn't touch the retired pair's runs.
  await renameShoe(page, "Shoe 2", "Clifton 11");
  await expect(shoeCard(page, "Clifton 11").first()).toBeVisible();
  await expect.poll(async () => (await db.shoes(page)).filter((x) => x.name === "Clifton 11").length).toBe(2);
  const newId = (await db.shoes(page)).find((x) => x.name === "Clifton 11" && !x.retired).id;
  await page.locator("#defaultShoeSelect").selectOption({ label: "Clifton 11" });
  await expect.poll(async () => (await dbRun(page, 22, "Easy")).shoeId).toBe(newId);
  expect((await dbRun(page, 22, "Quality")).shoeId).toBe(oldId);
  expect((await dbRun(page, 1, "Long")).shoeId).toBe(oldId);

  // Two active shoes can't share a name: rename is refused...
  await renameShoe(page, "Shoe 3", " clifton 11 ");
  await expect.poll(() => dialogs.seen.some((d) => d.type === "alert" && d.message.includes('already have an active shoe called "clifton 11"'))).toBe(true);
  await expect(page.locator('input.shoe-name-input[value="Shoe 3"]')).toHaveCount(1);
  expect((await db.shoes(page)).some((x) => x.name === "Shoe 3")).toBe(true);
  // ...and adding one asks again.
  dialogs.answer("Clifton 11", "Clifton 11 Blue");
  await page.getByRole("button", { name: "+ Add a shoe" }).click();
  await expect.poll(async () => (await db.shoes(page)).some((x) => x.name === "Clifton 11 Blue")).toBe(true);
  expect(dialogs.seen.some((d) => d.type === "prompt" && d.message.includes("already have an active shoe"))).toBe(true);

  // Un-retiring is refused while an active shoe has the same name...
  await page.locator(".shoe-card.retired").getByRole("button", { name: "Un-retire" }).click();
  await expect.poll(() => dialogs.seen.filter((d) => d.type === "alert" && d.message.includes("Rename one of them first")).length).toBe(1);
  expect((await db.shoes(page)).find((x) => x.id === oldId).retired).toBe(true);
  // ...and works once the names differ.
  await renameShoe(page, "Clifton 11", "Clifton 11 Green"); // the active one (the retired card's box also says Clifton 11)
  await expect.poll(async () => (await db.shoes(page)).find((x) => x.id === newId).name).toBe("Clifton 11 Green");
  await page.locator(".shoe-card.retired").getByRole("button", { name: "Un-retire" }).click();
  await expect.poll(async () => (await db.shoes(page)).find((x) => x.id === oldId).retired).toBe(false);
  await expect(page.locator(".shoe-card.retired")).toHaveCount(0);
  await gotoTab(page, "Schedule");
  await expect(selectedShoeText(runRow(page, 22, "Quality"))).toHaveText("Clifton 11");
});

test("two retired pairs with the same name and month are told apart by full date", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-22T05:30:00-07:00"));
  await start(page);
  await renameShoe(page, "Shoe 1", "Clifton 11");
  await expect.poll(async () => !!(await shoeByName(page, "Clifton 11"))).toBe(true);
  await shoeCard(page, "Clifton 11").getByRole("button", { name: "Retire" }).click();
  await expect(page.locator(".shoe-card.retired")).toHaveCount(1);
  await renameShoe(page, "Shoe 2", "Clifton 11");
  await expect.poll(async () => (await db.shoes(page)).filter((x) => x.name === "Clifton 11").length).toBe(2);
  await page.locator(".shoe-card:not(.retired)", { has: page.locator('input.shoe-name-input[value="Clifton 11"]') }).getByRole("button", { name: "Retire" }).click();
  await expect(page.locator(".shoe-card.retired")).toHaveCount(2);
  await expect(page.locator(".shoe-card.retired").nth(0)).toContainText("Clifton 11 (retired Oct 22, 2026)");
  await expect(page.locator(".shoe-card.retired").nth(1)).toContainText("Clifton 11 (retired Oct 22, 2026)");
});

test("a failed save shows a message that stays until dismissed", async ({ page, errors }) => {
  errors.allow = true; // the failed save is logged to the console on purpose
  await start(page);
  await page.evaluate(() => (window.__fakeFirestore.failNextWrite = "permission-denied"));
  const notes = runRow(page, 22, "Quality").locator(".run-notes-input");
  await notes.fill("felt good");
  await notes.press("Tab");
  const banner = page.locator("#saveError");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("didn't save");
  await expect(banner).toContainText("Missing or insufficient permissions");
  expect((await dbRun(page, 22, "Quality")).notes).toBe("7 tempo");

  // A later successful save (which refreshes the screen) doesn't hide it.
  const easyNotes = runRow(page, 22, "Easy").locator(".run-notes-input");
  await easyNotes.fill("ok");
  await easyNotes.press("Tab");
  await expect.poll(async () => (await dbRun(page, 22, "Easy")).notes).toBe("ok");
  await expect(banner).toBeVisible();

  await banner.getByRole("button", { name: "Dismiss" }).click();
  await expect(banner).toBeHidden();
  expect(errors.list.every((e) => e.includes("insufficient permissions"))).toBe(true);
});

test("edit mode: add and delete a run, add a run style, add a week", async ({ page, dialogs }) => {
  await start(page);
  const cycleId = await firstCycleId(page);
  await page.getByRole("button", { name: "Edit plan" }).click();
  await expect(page.locator("#editHint")).toBeVisible();

  await page.getByRole("button", { name: "+ Add a run to week 22" }).click();
  await expect.poll(async () => (await db.runs(page, cycleId)).length).toBe(SEED.runs + 1);
  const newRow = weekCard(page, 22).locator(".run-row.editing", { has: page.locator('input.f-plan[value="0"]') });
  await expect(newRow).toHaveCount(1);

  dialogs.answer("Speed");
  await newRow.locator("select.f-session").selectOption("__add_new__");
  await expect.poll(async () => (await db.settings(page)).runStyles).toContain("Speed");
  await expect.poll(async () => (await db.runs(page, cycleId)).filter((r) => r.session === "Speed").length).toBe(1);

  await weekCard(page, 22).locator(".run-row.editing", { has: page.locator('input.f-plan[value="0"]') }).locator(".delete-run-btn").click();
  await expect.poll(async () => (await db.runs(page, cycleId)).length).toBe(SEED.runs);

  dialogs.answer("29", "2026-12-13");
  await page.getByRole("button", { name: "+ Add a new week" }).click();
  await expect.poll(async () => (await db.runs(page, cycleId)).filter((r) => r.week === 29).map((r) => r.date)).toEqual(["2026-12-13"]);

  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.locator("#editHint")).toBeHidden();
  await expect(page.locator("#tab-schedule .delete-run-btn")).toHaveCount(0);
});

test("cycles: create, archive, restore, and delete forever (taking its miles off the shoes)", async ({ page, dialogs }) => {
  await start(page);
  await runRow(page, 22, "Quality").locator(".shoe-select").selectOption({ label: "Shoe 1" });
  await expect.poll(async () => (await dbRun(page, 22, "Quality")).shoeId).toBeTruthy();
  await runRow(page, 22, "Quality").locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(7);

  await page.getByRole("button", { name: "Manage cycles" }).click();
  dialogs.answer("Spring 2027", "2027-04-01");
  await page.getByRole("button", { name: "+ New cycle" }).click();
  await expect(page.locator("#cycleSelect option:checked")).toHaveText("Spring 2027");
  await expect(page.locator("#tab-schedule")).toContainText("No runs in this cycle yet.");
  const spring = await (async () => (await db.cycles(page)).find((c) => c.name === "Spring 2027"))();
  expect(spring).toMatchObject({ raceDate: "2027-04-01", status: "active" });

  const springRow = page.locator(".cycle-row", { has: page.locator('input.cycle-name-input[value="Spring 2027"]') });
  await springRow.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator("#cycleSelect option", { hasText: "Spring 2027" })).toHaveCount(0);
  await expect(page.locator("#manageCyclesPanel")).toContainText("Archived");
  await expect(page.locator("#cycleSelect option:checked")).toHaveText("Fall 2026 Marathon");

  await springRow.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("#cycleSelect option:checked")).toHaveText("Spring 2027");
  expect((await db.cycles(page)).find((c) => c.name === "Spring 2027").status).toBe("active");

  await page.locator("#cycleSelect").selectOption({ label: "Fall 2026 Marathon" });
  await expect(page.locator(".week-card.current-week")).toBeVisible();

  const fallId = await firstCycleId(page);
  const fallRow = page.locator(".cycle-row", { has: page.locator('input.cycle-name-input[value="Fall 2026 Marathon"]') });
  await fallRow.getByRole("button", { name: "Delete this cycle forever" }).click();
  await expect.poll(async () => (await db.cycles(page)).map((c) => c.name)).toEqual(["Spring 2027"]);
  expect(await db.runs(page, fallId)).toEqual([]);
  expect(await shoeMiles(page, "Shoe 1")).toBe(0);
});

test("export and import a cycle", async ({ page, dialogs }) => {
  // 9:30 pm Pacific on Oct 22 -- already Oct 23 in UTC. The file name must use the local date.
  await page.clock.setFixedTime(new Date("2026-10-22T21:30:00-07:00"));
  await start(page);
  await runRow(page, 22, "Quality").locator(".shoe-select").selectOption({ label: "Shoe 1" });
  await expect.poll(async () => (await dbRun(page, 22, "Quality")).shoeId).toBeTruthy();
  await runRow(page, 22, "Quality").locator(".done-toggle").check();
  await expect.poll(() => shoeMiles(page, "Shoe 1")).toBe(7);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export this cycle" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("marathon-tracker-backup-2026-10-22.json");
  const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  expect(exported.cycleName).toBe("Fall 2026 Marathon");
  expect(exported.rows).toHaveLength(SEED.runs);
  expect(exported.rows.find((r) => r.week === 22 && r.session === "Quality")).toMatchObject({ done: true, actual: 7, notes: "7 tempo" });

  const backup = {
    rows: [
      { week: 1, date: "2027-01-03", session: "Easy", plan: 4, actual: null, done: false, notes: "first" },
      { week: 2, date: "2027-01-10", session: "Long", plan: 6, actual: null, done: false, notes: "" },
    ],
  };
  await page.locator("#importFile").setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await expect.poll(async () => (await db.runs(page, await firstCycleId(page))).length).toBe(2);
  await expect(page.locator(".week-card.current-week .week-title")).toContainText("Week 1");
  expect(await shoeMiles(page, "Shoe 1")).toBe(0); // the replaced runs' miles came back off the shoe
  expect(dialogs.seen.map((d) => d.message)).toContain("Import complete.");
});

test("layout fits the screen on every tab", async ({ page }, testInfo) => {
  await start(page);
  for (const tab of ["Schedule", "Shoes", "Reference"]) {
    await gotoTab(page, tab);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${tab} tab scrolls sideways`).toBeLessThanOrEqual(0);
  }
  await gotoTab(page, "Schedule");
  const main = await page.locator(".schedule-main").boundingBox();
  const side = await page.locator(".schedule-sidebar").boundingBox();
  if (testInfo.project.name === "phone") {
    expect(side.y).toBeGreaterThanOrEqual(main.y + main.height - 1); // completed weeks stack below
  } else {
    expect(side.x).toBeGreaterThanOrEqual(main.x + main.width - 1); // completed weeks sit to the right
  }
  // The completed-week rows expand on tap.
  const firstCompleted = page.locator(".wrc-head").first();
  await firstCompleted.click();
  await expect(page.locator(".wrc-body")).toHaveCount(1);
});

// Accessibility: automated WCAG 2.1 A/AA check of every screen, light and
// dark. Only serious and critical problems fail the test. KNOWN_A11Y lists
// problems that already existed when this suite was written (2026-10-21),
// as "rule element" -> reason. Anything not on the list fails.
const KNOWN_A11Y = {
  "color-contrast #signInBtn": "white on the blue accent is 4.4:1 (needs 4.5) -- pre-existing",
  "color-contrast #signOutBtn": "blue accent link on the page background is 4.2:1 (needs 4.5) -- pre-existing",
  "color-contrast .current-badge": "white on the blue accent is 4.4:1 (needs 4.5) -- pre-existing",
  "color-contrast #editModeBtn": "'Done editing' is white on the blue accent, 4.4:1 (needs 4.5) -- pre-existing",
  'color-contrast button[data-tab="schedule"]': "dark mode: selected tab is white on blue, 3.6:1 -- pre-existing",
  'color-contrast button[data-tab="shoes"]': "dark mode: selected tab is white on blue, 3.6:1 -- pre-existing",
  'color-contrast button[data-tab="reference"]': "dark mode: selected tab is white on blue, 3.6:1 -- pre-existing",
};

test("accessibility: no new serious problems on any screen", async ({ page, errors }) => {
  test.setTimeout(120000); // 11 full-page scans; slow when tests run in parallel
  errors.allow = true; // one scan deliberately shows the failed-save message
  const scan = async (label) => {
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const found = [];
    for (const v of results.violations) {
      if (v.impact !== "serious" && v.impact !== "critical") continue;
      for (const node of v.nodes) {
        const key = `${v.id} ${node.target.join(" ")}`;
        if (!(key in KNOWN_A11Y)) found.push(`${label}: ${key} (${v.impact}) -- ${v.help}`);
      }
    }
    return found;
  };
  const problems = [];
  await openApp(page);
  problems.push(...(await scan("signed out")));
  await signIn(page);
  problems.push(...(await scan("schedule")));
  await page.getByRole("button", { name: "Edit plan" }).click();
  problems.push(...(await scan("edit mode")));
  await page.getByRole("button", { name: "Done editing" }).click();
  await page.getByRole("button", { name: "Manage cycles" }).click();
  problems.push(...(await scan("manage cycles")));
  await gotoTab(page, "Shoes");
  await shoeCard(page, "Shoe 3").getByRole("button", { name: "Retire" }).click();
  await expect(page.locator(".shoe-card.retired")).toHaveCount(1);
  problems.push(...(await scan("shoes (with a retired shoe)")));
  await gotoTab(page, "Reference");
  problems.push(...(await scan("reference")));

  await gotoTab(page, "Schedule");
  await page.evaluate(() => (window.__fakeFirestore.failNextWrite = "permission-denied"));
  const notes = runRow(page, 22, "Quality").locator(".run-notes-input");
  await notes.fill("x");
  await notes.press("Tab");
  await expect(page.locator("#saveError")).toBeVisible();
  problems.push(...(await scan("save error showing")));

  await page.emulateMedia({ colorScheme: "dark" });
  problems.push(...(await scan("dark: schedule + save error")));
  await gotoTab(page, "Shoes");
  problems.push(...(await scan("dark: shoes")));
  await gotoTab(page, "Reference");
  problems.push(...(await scan("dark: reference")));
  expect(problems).toEqual([]);
});

test("load speed: app is usable quickly and the page stays small", async ({ page }) => {
  const sizeKB = fs.statSync(APP_FILE).size / 1024;
  expect(sizeKB, "index.html size (KB)").toBeLessThan(150);
  const t0 = Date.now();
  await start(page); // includes first-time account setup
  const ms = Date.now() - t0;
  testInfo().annotations.push({ type: "load-ms", description: String(ms) });
  expect(ms, "time from opening the page to a usable schedule (ms, fake backend)").toBeLessThan(3000);
});
function testInfo() {
  return test.info();
}
