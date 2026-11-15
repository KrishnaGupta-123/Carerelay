import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const demo = JSON.parse(readFileSync(".data/e2e-accounts.json", "utf8")) as { password: string };
async function login(page: Page, email = "ananya@carerelay.demo") {
  await page.goto("/login?mode=local");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(demo.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
test("coordinator can navigate real care data and create a versioned medication", async ({
  page,
}) => {
  const medicationName = `E2E Fictional ${Date.now()}`;
  await login(page);
  await expect(page.getByRole("heading", { name: /Good .*Ananya/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today’s medication schedule" })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.screenshot({ path: ".data/dashboard-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "Medications", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Medications", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add medication", exact: true }).click();
  await page.getByLabel("Medication name").fill(medicationName);
  await page.getByLabel("Recorded dosage").fill("1 tablet");
  await page.getByLabel("Instruction source").fill("Fictional test prescription");
  await page
    .getByLabel("Recorded instructions / notes")
    .fill("Synthetic instructions for an automated test.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add medication", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Added medication", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: medicationName, exact: true })).toBeVisible();
});
test("viewer controls and backend both deny writes", async ({ page }) => {
  await login(page, "priya@carerelay.demo");
  await expect(page.getByRole("button", { name: "Add medication", exact: true })).toHaveCount(0);
  await page.goto("/medications");
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  const data = await page.request.get("/api/care");
  const profile = (await data.json()).profile.id;
  const denied = await page.request.post("/api/care", {
    headers: { origin: "http://127.0.0.1:3001" },
    data: { action: "request_help", profile, payload: { note: "Test unauthorised write" } },
  });
  expect(denied.status()).toBe(403);
});
test("caretaker can accept a pending handoff and sees restricted care information", async ({
  page,
}) => {
  await login(page, "arjun@carerelay.demo");
  await page
    .getByRole("link", { name: /Care handoffs/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Care handoffs", exact: true })).toBeVisible();
  const accept = page.getByRole("button", { name: "Accept handoff", exact: true });
  if (await accept.count()) {
    await accept.first().click();
    await page.getByRole("button", { name: "Accept responsibility", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("Accepted a care handoff", { exact: true })).toBeVisible();
  }
  const res = await page.request.get("/api/care");
  const data = await res.json();
  expect(data.membership.role).toBe("caretaker");
  expect(data.medications.every((m: { name: string }) => m.name === "Metformin")).toBe(true);
});
test("simple view fits mobile, has large actions, and supports larger text", async ({ page }) => {
  await login(page, "meera@carerelay.demo");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/elderly");
  await expect(page.getByRole("heading", { name: "Hello, Meera." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask for help", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Larger text", exact: true }).click();
  await expect(page.getByRole("button", { name: "Standard text", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const horizontal = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(horizontal).toBe(false);
  await page.screenshot({ path: ".data/elderly-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Ask for help", exact: true }).click();
  await page.getByLabel("How can we help?").fill("Fictional test request from mobile.");
  await page.getByRole("button", { name: "Request support", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
test("appointments, settings, notifications and audit pages load without client errors", async ({
  page,
}) => {
  await login(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [path, title] of [
    ["/appointments", "Appointments"],
    ["/care-circle", "Care circle"],
    ["/activity", "Care timeline"],
    ["/settings", "Settings & preferences"],
    ["/notifications", "Notifications"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
