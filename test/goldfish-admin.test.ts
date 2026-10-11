import { describe, expect, it } from 'vitest';
import { GoldfishAdmin } from '../src/goldfish/admin.js';
import { testConfig } from './helpers.js';

function admin(answers: Array<number | Error>) {
  const calls: string[] = [];
  const client = new GoldfishAdmin(
    testConfig({ GOLDFISH_CLIENT_ID: 'cl_1' }),
    async (input, init) => {
      calls.push(`${init?.method} ${new URL(String(input)).pathname}`);
      const answer = answers.shift() ?? 200;
      if (answer instanceof Error) throw answer;
      return new Response(answer === 200 ? '{"items":[]}' : 'Bad Gateway', { status: answer });
    },
    [0, 0],
  );
  return { client, calls };
}

describe('GoldfishAdmin', () => {
  it('asks a read again while the Goldfish server restarts', async () => {
    const { client, calls } = admin([502, new TypeError('fetch failed: ECONNREFUSED'), 200]);
    const res = await client.hotel('yandex:1', 'GET', '/feed?limit=20');
    expect(res).toEqual({ status: 200, body: { items: [] } });
    expect(calls).toHaveLength(3);
  });

  it('gives up on a read after the last try', async () => {
    const { client, calls } = admin([502, 503, 504]);
    await expect(client.hotel('yandex:1', 'GET', '/feed')).rejects.toThrow('GET hotel/feed: 504');
    expect(calls).toHaveLength(3);
  });

  it('sends a change once and does not wait on a server that does not answer', async () => {
    const post = admin([502]);
    await expect(post.client.hotel('yandex:1', 'POST', '/duties/x/run', {})).rejects.toThrow('502');
    expect(post.calls).toEqual(['POST /admin/users/cl_1/yandex%3A1/hotel/duties/x/run']);

    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });
    const slow = admin([timeout, 200]);
    await expect(slow.client.hotel('yandex:1', 'GET', '/feed')).rejects.toThrow('timeout');
    expect(slow.calls).toHaveLength(1);
  });
});
