import { destination, multistream, pino, transport, type Logger } from 'pino';

export type { Logger };

/** Gets every line the logger writes (errors for the Goldfish journal); stdout gets them too. */
export interface LogSink {
  write(line: string): void;
}

export function createLogger(level: string, pretty = false, sink?: LogSink): Logger {
  const options = {
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
  };
  if (!sink)
    return pino({
      ...options,
      ...(pretty ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
    });
  const out = pretty
    ? transport({ target: 'pino-pretty', options: { colorize: true } })
    : destination(1);
  return pino(
    options,
    multistream([
      { level: 'trace', stream: out },
      { level: 'trace', stream: sink },
    ]),
  );
}
