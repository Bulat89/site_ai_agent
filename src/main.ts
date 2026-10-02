import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createServices } from './services.js';
import { createLogger } from './util/logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const log = createLogger(
    config.LOG_LEVEL,
    config.NODE_ENV === 'development' && process.stdout.isTTY,
  );
  const services = await createServices(config, log);
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
