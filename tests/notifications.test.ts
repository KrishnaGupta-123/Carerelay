import { describe, it, expect } from "vitest";
import { emailHtml, escapeHtml, verifyCronAuthorization } from "@/server/notifications";
describe("Notification content and protected scheduler", () => {
  it("escapes malicious text in HTML and includes a privacy-preserving app link", () => {
    const html = emailHtml("Care update <script>", 'A recorded update & "details"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("/dashboard");
    expect(html).toContain("does not verify ingestion");
    expect(escapeHtml("<a>&\"'")).toBe("&lt;a&gt;&amp;&quot;&#39;");
  });
  it("requires the exact bearer secret", () => {
    process.env.CRON_SECRET = "test-cron-secret-that-is-long-enough-12345";
    expect(verifyCronAuthorization(null)).toBe(false);
    expect(verifyCronAuthorization("Bearer wrong")).toBe(false);
    expect(verifyCronAuthorization(`Bearer ${process.env.CRON_SECRET}`)).toBe(true);
  });
});
