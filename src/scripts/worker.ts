import { initCron } from "../lib/cron";

process.title = "yomu-worker";

const started = initCron();
console.log(
  started
    ? "[yomu] Worker scheduler started."
    : "[yomu] Worker scheduler idle.",
);

function shutdown(signal: NodeJS.Signals): void {
  console.log(`[yomu] Worker received ${signal}; shutting down.`);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

let heartbeat = 0;
setInterval(() => {
  heartbeat = (heartbeat + 1) % Number.MAX_SAFE_INTEGER;
}, 60 * 60 * 1000);
