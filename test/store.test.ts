import { afterAll, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory.js';
import { PostgresStore } from '../src/store/postgres.js';
import type { Store } from '../src/store/types.js';

// The same contract for both stores; PostgreSQL runs when TEST_DATABASE_URL is set.
const DB = process.env.TEST_DATABASE_URL;
const stores: Array<[string, () => Promise<Store>]> = [
  ['memory', async () => new MemoryStore()],
  ...(DB
    ? [['postgres', async () => PostgresStore.connect(DB)] as [string, () => Promise<Store>]]
    : []),
];

const open: Store[] = [];
afterAll(async () => {
  await Promise.all(open.map((s) => s.close()));
});

describe.each(stores)('%s store', (_name, make) => {
  const get = async () => {
    const store = await make();
    open.push(store);
    return store;
  };
  const yandexId = () => `ya_${Math.random().toString(36).slice(2)}`;

  it('creates a user once per Yandex ID and refreshes the profile', async () => {
    const store = await get();
    const id = yandexId();
    const a = await store.upsertYandexUser({
      yandexId: id,
      login: 'a',
      email: 'a@yandex.ru',
      name: 'A',
      avatarId: null,
    });
    expect(a).toMatchObject({ yandexId: id, email: 'a@yandex.ru', tokenId: null });
    const b = await store.upsertYandexUser({
      yandexId: id,
      login: 'a',
      email: 'b@yandex.ru',
      name: 'B',
      avatarId: '1/x',
    });
    expect(b.id).toBe(a.id);
    expect(b).toMatchObject({ email: 'b@yandex.ru', name: 'B', avatarId: '1/x' });
    expect(b.createdAt).toBe(a.createdAt);
    expect(await store.getUser(a.id)).toEqual(b);
  });

  it('records the issued token and downloads', async () => {
    const store = await get();
    const u = await store.upsertYandexUser({
      yandexId: yandexId(),
      login: null,
      email: null,
      name: null,
      avatarId: null,
    });
    const withToken = await store.setToken(u.id, 'tok_1');
    expect(withToken.tokenId).toBe('tok_1');
    expect(withToken.tokenIssuedAt).not.toBeNull();
    await store.markDownload(u.id);
    expect((await store.getUser(u.id))!.lastDownloadAt).not.toBeNull();
  });

  it('finds live sessions, forgets expired and deleted ones', async () => {
    const store = await get();
    const u = await store.upsertYandexUser({
      yandexId: yandexId(),
      login: 'x',
      email: null,
      name: null,
      avatarId: null,
    });
    const live = `live_${u.id}`;
    const old = `old_${u.id}`;
    await store.createSession(live, u.id, new Date(Date.now() + 60_000));
    await store.createSession(old, u.id, new Date(Date.now() - 1000));
    expect((await store.sessionUser(live))?.id).toBe(u.id);
    expect(await store.sessionUser(old)).toBeNull();
    expect(await store.deleteExpiredSessions()).toBeGreaterThanOrEqual(1);
    await store.deleteSession(live);
    expect(await store.sessionUser(live)).toBeNull();
    await store.ping();
  });
});
