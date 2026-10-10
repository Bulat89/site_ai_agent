/** An error of the site as the Goldfish server's journal takes it (POST /admin/errors). */
export interface ErrorReport {
  level: 'warn' | 'error' | 'fatal';
  message: string;
  errorType?: string;
  errorMessage?: string;
  stack?: string;
  context?: Record<string, unknown>;
  at?: string;
}

/** pino fields that are the line itself, not its context. */
const OWN_FIELDS = new Set(['level', 'time', 'msg', 'pid', 'hostname', 'service', 'err', 'v']);
/** Reports waiting for the server at most; older ones are dropped. */
const MAX_QUEUED = 200;
const BATCH = 100;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}…` : s);

/** Codes, states and tokens in logged addresses (the Yandex ID callback carries them). */
export function maskSecrets(text: string): string {
  return text
    .replace(/([?&](?:token|key|secret|code|state)=)[^\s"\\&#]+/gi, '$1[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/g, '$1[redacted]');
}

/** Context without secrets and not larger than 4 KB (whole, or as clipped text). */
function boundContext(context: Record<string, unknown>): Record<string, unknown> {
  const json = maskSecrets(JSON.stringify(context));
  return json.length <= 4_000
    ? (JSON.parse(json) as Record<string, unknown>)
    : { clipped: clip(json, 4_000) };
}

/** A parsed pino line at warn and above → a report; anything lower → null. */
export function reportOf(rec: Record<string, unknown>): ErrorReport | null {
  const n = typeof rec.level === 'number' ? rec.level : 0;
  if (n < 40) return null;
  const level = n >= 60 ? 'fatal' : n >= 50 ? 'error' : 'warn';
  const err = rec.err as { type?: unknown; message?: unknown; stack?: unknown } | undefined;
  const context: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (OWN_FIELDS.has(k)) continue;
    if (k === 'req' && v && typeof v === 'object') {
      const { method, url } = v as { method?: string; url?: string };
      context.req = `${method ?? ''} ${url ?? ''}`.trim();
    } else context[k] = typeof v === 'string' ? clip(v, 500) : v;
  }
  const text = (v: unknown, max: number) =>
    typeof v === 'string' && v ? maskSecrets(clip(v, max)) : undefined;
  const errorMessage = text(err?.message, 2_000);
  const errorType = text(err?.type, 200);
  const stack = text(err?.stack, 8_000);
  return {
    level,
    message: text(rec.msg, 2_000) ?? errorMessage ?? 'error',
    ...(errorType ? { errorType } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    ...(stack ? { stack } : {}),
    context: boundContext(context),
    ...(typeof rec.time === 'number' ? { at: new Date(rec.time).toISOString() } : {}),
  };
}

/**
 * Errors of the site go to the error journal of the Goldfish server, where they are read over
 * MCP together with the server's own and fixed. The logger writes every line here; warnings and
 * errors are sent in batches. Never logs itself: its failures would be reported again.
 */
export class ErrorReporter {
  private readonly queue: ErrorReport[] = [];
  private send: ((reports: ErrorReport[]) => Promise<void>) | undefined;
  private timer: NodeJS.Timeout | undefined;
  private sending: Promise<void> | undefined;
  private lastComplaint = 0;

  constructor(private readonly flushMs = 5_000) {}

  readonly sink = {
    write: (line: string): void => {
      if (!/"level":(4|5|6)\d/.test(line)) return;
      try {
        const report = reportOf(JSON.parse(line) as Record<string, unknown>);
        if (report) this.add(report);
      } catch {
        // The line is in stdout anyway; reporting never breaks logging.
      }
    },
  };

  add(report: ErrorReport): void {
    this.queue.push(report);
    if (this.queue.length > MAX_QUEUED) this.queue.shift();
    this.schedule();
  }

  /** Starts sending; what was logged before (startup) goes first. */
  start(send: (reports: ErrorReport[]) => Promise<void>): void {
    this.send = send;
    this.schedule();
  }

  private schedule(): void {
    if (this.timer || !this.send) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, this.flushMs);
    this.timer.unref();
  }

  async flush(): Promise<void> {
    if (this.sending) await this.sending;
    if (!this.send || this.queue.length === 0) return;
    const batch = this.queue.splice(0, BATCH);
    this.sending = this.send(batch)
      .then(() => {
        if (this.queue.length) this.schedule();
      })
      .catch((err: unknown) => {
        // Kept for the next try; when the queue is full, the oldest of the batch are dropped.
        const room = MAX_QUEUED - this.queue.length;
        if (room > 0) this.queue.unshift(...batch.slice(Math.max(0, batch.length - room)));
        this.complain(err);
        this.schedule();
      })
      .finally(() => {
        this.sending = undefined;
      });
    await this.sending;
  }

  get pending(): number {
    return this.queue.length;
  }

  /** Straight to stderr, at most once a minute. */
  private complain(err: unknown): void {
    const now = Date.now();
    if (now - this.lastComplaint < 60_000) return;
    this.lastComplaint = now;
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `${JSON.stringify({ level: 40, time: now, service: 'goldfish-site', msg: 'errors not reported to goldfish', err: { message } })}\n`,
    );
  }
}
