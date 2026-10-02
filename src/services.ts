import { AccessService } from './access.js';
import { Sessions } from './auth/session.js';
import { YandexAuth } from './auth/yandex.js';
import { isSecure, type Config } from './config.js';
import { GoldfishAdmin } from './goldfish/admin.js';
import { MemoryStore } from './store/memory.js';
import { PostgresStore } from './store/postgres.js';
import type { Store } from './store/types.js';
import type { Logger } from './util/logger.js';

export interface Services {
  config: Config;
  log: Logger;
  store: Store;
  sessions: Sessions;
  yandex: YandexAuth;
  goldfish: GoldfishAdmin;
  access: AccessService;
}

export async function createServices(
  config: Config,
  log: Logger,
  overrides: { store?: Store; fetch?: typeof fetch } = {},
): Promise<Services> {
  const store =
    overrides.store ??
    (config.DATABASE_URL ? await PostgresStore.connect(config.DATABASE_URL) : new MemoryStore());
  if (!overrides.store && !config.DATABASE_URL)
    log.warn('DATABASE_URL is not set: users and sessions are kept in memory');
  const goldfish = new GoldfishAdmin(config, overrides.fetch);
  return {
    config,
    log,
    store,
    sessions: new Sessions(store, isSecure(config), config.SESSION_DAYS),
    yandex: new YandexAuth(config, overrides.fetch),
    goldfish,
    access: new AccessService(store, goldfish),
  };
}
