import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { GoldfishAdmin } from '../src/goldfish/admin.js';
import {
  ErrorReporter,
  maskSecrets,
  reportOf,
  type ErrorReport,
} from '../src/util/error-reports.js';
import { ADMIN_TOKEN, testConfig } from './helpers.js';

describe('error reports to the Goldfish journal', () => {
  it('turns warnings and errors of the log into reports; info stays out', () => {
    const r = reportOf({
      level: 50,
      time: 0,
      msg: 'agents page: goldfish unavailable',
      pid: 1,
      hostname: 'h',
      reqId: 'req-1',
      req: { method: 'GET', url: '/auth/yandex/callback?code=123456&state=abc' },
      err: { type: 'GoldfishError', message: 'GET /admin/users: 502', stack: 'GoldfishError: …' },
    });
    expect(r).toEqual({
      level: 'error',
      message: 'agents page: goldfish unavailable',
      errorType: 'GoldfishError',
      errorMessage: 'GET /admin/users: 502',
      stack: 'GoldfishError: …',
      context: {
        reqId: 'req-1',
        req: 'GET /auth/yandex/callback?code=[redacted]&state=[redacted]',
      },
      at: '1970-01-01T00:00:00.000Z',
    });
    expect(reportOf({ level: 30, msg: 'fine' })).toBeNull();
    expect(reportOf({ level: 40, msg: 'x', big: 'y'.repeat(10_000) })!.context).toEqual({
      big: `${'y'.repeat(500)}…`,
    });
    expect(maskSecrets('Bearer abcdefghijkl')).toBe('Bearer [redacted]');
  });

  it('sends what the logger wrote in batches and retries when the server is away', async () => {
    const reporter = new ErrorReporter(10);
    const log = pino({ level: 'info' }, reporter.sink);
    log.error({ err: new Error('boom') }, 'device token not issued');
    log.warn('extension package is not available');
    log.info('fine');
    expect(reporter.pending).toBe(2);

    const sent: ErrorReport[][] = [];
    let down = true;
    reporter.start(async (batch) => {
      if (down) throw new Error('unreachable');
      sent.push(batch);
    });
    const stderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
      await reporter.flush();
    } finally {
      process.stderr.write = stderr;
    }
    expect(reporter.pending).toBe(2);

    down = false;
    await reporter.flush();
    expect(reporter.pending).toBe(0);
    expect(sent[0]!.map((r) => [r.level, r.message, r.errorMessage])).toEqual([
      ['error', 'device token not issued', 'boom'],
      ['warn', 'extension package is not available', undefined],
    ]);
  });

  it('posts to /admin/errors of the Goldfish server with the admin token', async () => {
    const calls: Array<{ url: string; auth: string | null; body: unknown }> = [];
    const admin = new GoldfishAdmin(testConfig(), async (input, init) => {
      calls.push({
        url: String(input),
        auth: new Headers(init?.headers).get('authorization'),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({ accepted: 1 }), { status: 202 });
    });
    await admin.reportErrors([{ level: 'error', message: 'x' }]);
    expect(calls).toEqual([
      {
        url: 'https://agent.test/admin/errors',
        auth: `Bearer ${ADMIN_TOKEN}`,
        body: { source: 'site', events: [{ level: 'error', message: 'x' }] },
      },
    ]);
  });

  it('can be switched off', () => {
    expect(testConfig().REPORT_ERRORS).toBe(true);
    expect(testConfig({ REPORT_ERRORS: 'false' }).REPORT_ERRORS).toBe(false);
  });
});
