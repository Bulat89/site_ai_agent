import { z } from 'zod';

const url = z
  .string()
  .url()
  .transform((v) => v.replace(/\/+$/, ''));

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /** Address of this site as users open it: OAuth redirect, cookie security, Origin checks. */
    PUBLIC_URL: url,
    /** PostgreSQL. Without it users and sessions live in memory (development only). */
    DATABASE_URL: z.string().optional(),
    SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),

    /** Yandex ID application (oauth.yandex.ru): ClientID and Client secret. */
    YANDEX_CLIENT_ID: z.string().min(1),
    YANDEX_CLIENT_SECRET: z.string().min(1),
    /** Overridable for tests only. */
    YANDEX_OAUTH_URL: url.default('https://oauth.yandex.ru'),
    YANDEX_LOGIN_URL: url.default('https://login.yandex.ru'),

    /** Goldfish server as the extension connects to it (shown to users). */
    GOLDFISH_URL: url,
    /** Where this site reaches the admin API; defaults to GOLDFISH_URL (e.g. http://server:8080). */
    GOLDFISH_ADMIN_URL: url.optional(),
    /** ADMIN_TOKEN of the Goldfish server. */
    GOLDFISH_ADMIN_TOKEN: z.string().min(16),
    /** Goldfish client (company) that owns site users; found or created by name when unset. */
    GOLDFISH_CLIENT_ID: z.string().optional(),
    GOLDFISH_CLIENT_NAME: z.string().min(1).max(200).default('Сайт'),

    /** Extension zip to hand out; when unset or missing it is taken from GOLDFISH_URL. */
    EXTENSION_ZIP: z.string().optional(),
    /** Optional links in the footer. */
    PRIVACY_URL: url.optional(),
    SUPPORT_EMAIL: z.email().optional(),
  })
  .transform((env) => ({
    ...env,
    GOLDFISH_ADMIN_URL: env.GOLDFISH_ADMIN_URL ?? env.GOLDFISH_URL,
  }));

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // Empty values in .env files mean "not set".
  const cleaned = Object.fromEntries(Object.entries(env).filter(([, v]) => v !== ''));
  const res = EnvSchema.safeParse(cleaned);
  if (!res.success) throw new Error(`Invalid configuration:\n${z.prettifyError(res.error)}`);
  const config = res.data;
  if (config.NODE_ENV === 'production' && !config.DATABASE_URL)
    throw new Error('Invalid configuration: DATABASE_URL is required in production');
  return config;
}

/** Cookies get the __Host- prefix and Secure flag whenever the site is served over https. */
export function isSecure(config: Pick<Config, 'PUBLIC_URL'>): boolean {
  return config.PUBLIC_URL.startsWith('https://');
}
