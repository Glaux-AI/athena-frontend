/* eslint-disable */
// Launcher used by .claude/launch.json. The Claude Preview tool starts
// processes with cwd = workspace root, not the package root — this wrapper
// chdir's into athena-frontend/ and then spawns `next dev` so paths resolve.

const path = require("path");
const { spawn } = require("child_process");

const pkgRoot = path.resolve(__dirname, "..");
process.chdir(pkgRoot);
process.env.NEXT_PUBLIC_API_MODE = process.env.NEXT_PUBLIC_API_MODE || "mock";

const nextBin = path.join(pkgRoot, "node_modules", "next", "dist", "bin", "next");
const port = process.argv[2] || "3000";

const child = spawn(process.execPath, [nextBin, "dev", "--port", port], {
  cwd: pkgRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
