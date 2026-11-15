import { execFileSync } from "node:child_process";
export default async function setup() {
  execFileSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "--conditions=react-server", "scripts/seed.ts", "--local"],
    {
      env: {
        ...process.env,
        LOCAL_DEVELOPMENT_MODE: "true",
        CARE_DEMO_CREDENTIALS: ".data/e2e-accounts.json",
      },
      stdio: "pipe",
    },
  );
}
