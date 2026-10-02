import { pino, type Logger } from 'pino';

export type { Logger };

export function createLogger(level: string, pretty = false): Logger {
  return pino({
    level,
    base: { service: 'goldfish-site' },
    redact: {
      paths: [
        'token',
        '*.token',
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
  });
}
