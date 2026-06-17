export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCron } = await import("./lib/cron");
    const started = initCron();
    console.log(
      started
        ? "[yomu] Cron scheduler initialized."
        : "[yomu] Cron scheduler not started.",
    );
  }
}
