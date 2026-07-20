import { spawn } from "node:child_process";
import { resolve } from "node:path";

const projectRoot = process.cwd();

process.loadEnvFile(resolve(projectRoot, ".env.qa.local"));

const qaDatabasePath = resolve(projectRoot, "data/yomu-qa.db");
const configuredDatabasePath = resolve(
  projectRoot,
  process.env.DATABASE_PATH ?? "",
);

if (configuredDatabasePath !== qaDatabasePath) {
  throw new Error(
    `Refusing to start local QA with a non-QA database. DATABASE_PATH must resolve to ${qaDatabasePath}`,
  );
}

const nextBin = resolve(projectRoot, "node_modules/next/dist/bin/next");
const child = spawn(
  process.execPath,
  [nextBin, "dev", "--hostname", "127.0.0.1", "--port", "3391"],
  {
    env: process.env,
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  console.error("[yomu] Failed to start the local QA server.", error);
  process.exitCode = 1;
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
