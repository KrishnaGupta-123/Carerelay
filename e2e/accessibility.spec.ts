import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
const demo = JSON.parse(readFileSync(".data/e2e-accounts.json", "utf8")) as { password: string };
test("login and simple view have accessible names, labels, focus and contrast", async ({
  page,
}) => {
  await page.goto("/login?mode=local");
  const login = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    login.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({ html: n.html, summary: n.failureSummary })),
    })),
  ).toEqual([]);
  await page.getByLabel("Email address").fill("meera@carerelay.demo");
  await page.getByLabel("Password", { exact: true }).fill(demo.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/elderly");
  const simple = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(simple.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }))).toEqual(
    [],
  );
  await page.getByRole("button", { name: "Ask for help", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  const dialog = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(dialog.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }))).toEqual(
    [],
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
