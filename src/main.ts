import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createServices } from './services.js';
import { ErrorReporter } from './util/error-reports.js';
import { createLogger } from './util/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  // Warnings and errors also go to the Goldfish server's error journal (read there over MCP).
  const reporter = config.REPORT_ERRORS ? new ErrorReporter() : undefined;
  const log = createLogger(
    config.LOG_LEVEL,
    config.NODE_ENV === 'development' && process.stdout.isTTY,
    reporter?.sink,
  );
  let crashed = false;
  const crash = (err: unknown, kind: string) => {
    if (crashed) return;
    crashed = true;
    log.fatal({ err }, kind);
    log.flush();
    const sent = reporter?.flush().catch(() => undefined);
    const timeout = new Promise((resolve) => setTimeout(resolve, 3_000).unref());
    void Promise.race([sent, timeout]).finally(() => process.exit(1));
  };
  process.on('uncaughtException', (err) => crash(err, 'uncaught exception'));
  process.on('unhandledRejection', (err) => crash(err, 'unhandled promise rejection'));

  const services = await createServices(config, log);
  reporter?.start((events) => services.goldfish.reportErrors(events));
  const app = await buildApp(services);

  const cleanup = setInterval(() => {
    void services.store
      .deleteExpiredSessions()
      .catch((err: unknown) => log.error({ err }, 'session cleanup failed'));
  }, 6 * 3_600_000);
  cleanup.unref();

  await app.listen({ host: config.HOST, port: config.PORT });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, 'shutting down');
    clearInterval(cleanup);
    await app.close();
    await reporter?.flush();
    await services.store.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
