import { pino } from 'pino';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createServices, type Services } from '../src/services.js';
import { MemoryStore } from '../src/store/memory.js';
import type { Store, UserRecord } from '../src/store/types.js';
import { pkceChallenge, sha256 } from '../src/util/crypto.js';

export const PUBLIC_URL = 'https://site.test';
export const GOLDFISH_URL = 'https://agent.test';
export const ADMIN_TOKEN = 'admin-token-0123456789';

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: 'test',
    PUBLIC_URL,
    YANDEX_CLIENT_ID: 'ya-client',
    YANDEX_CLIENT_SECRET: 'ya-secret',
    YANDEX_OAUTH_URL: 'https://oauth.yandex.test',
    YANDEX_LOGIN_URL: 'https://login.yandex.test',
    GOLDFISH_URL,
    GOLDFISH_ADMIN_TOKEN: ADMIN_TOKEN,
    ...env,
  });
}

export interface YandexProfile {
  id: string;
  login?: string;
  real_name?: string;
  display_name?: string;
  default_email?: string;
  default_avatar_id?: string;
  is_avatar_empty?: boolean;
}

/** In-memory Yandex ID (token + info endpoints) and Goldfish admin API behind one fetch. */
/** A ready draft of the reference from a card on Avito. */
export const IMPORT_READY = {
  id: 'imp_1',
  status: 'ready',
  source: 'url',
  url: 'https://www.avito.ru/sochi/doma/dom_1',
  platform: 'Авито',
  error: null,
  createdAt: '2026-10-09T10:00:00.000Z',
  fields: [
    { key: 'name', label: 'Название', value: 'Дом у моря <b>', current: 'Дом у моря' },
    { key: 'rooms', label: 'Номера', value: 'Люкс, до 3 гостей, 9 500 ₽', current: '' },
  ],
};

export class Fakes {
  /** GET …/hotel/profile/import: the latest draft, if any. */
  profileImport: unknown = null;
  // Yandex
  profile: YandexProfile = {
    id: '1000001',
    login: 'ivan.petrov',
    real_name: 'Иван Петров',
    default_email: 'ivan.petrov@yandex.ru',
    default_avatar_id: '131652443/abc-123',
    is_avatar_empty: false,
  };
  /** code → PKCE challenge the authorize request carried. */
  readonly codes = new Map<string, string>();
  tokenExchangeFails = false;

  // Goldfish
  readonly clients: Array<{ id: string; name: string }> = [];
  readonly users = new Map<string, { displayName?: string }>();
  readonly tokens = new Map<string, { clientId: string; userId: string; revoked: boolean }>();
  goldfishDown = false;
  /** Hotel agents of site users on the Goldfish server: requests the site forwarded. */
  readonly hotelCalls: Array<{ method: string; path: string; body: unknown }> = [];
  hotel = {
    id: 'prop_1',
    timezone: 'Europe/Moscow',
    profile: {
      name: 'Дом у моря',
      checkIn: '14:00',
      checkOut: '12:00',
      rooms: [{ id: 'std', name: 'Стандарт', count: 2 }],
      systems: [{ id: 'ostrovok' }],
      policies: { pets: 'Можно' },
      amenities: ['Wi-Fi'],
      priceCorridor: { percent: 10, byRoom: {} },
    } as Record<string, unknown>,
    profileVersion: 3,
    telegramLinked: false,
    hookConfigured: false,
    telegramBot: true,
    settings: {
      wave: 1,
      pause: null,
      owner: { quietFrom: '22:00', quietTo: '09:00', urgentPerDay: 5, summaryTime: '09:00' },
      limits: { reviewAutoMinStars: 4, sharpChangePercent: 40 },
      platforms: [
        { id: 'ostrovok', title: 'Островок', category: 'guest', mode: 'full' },
        { id: 'avito', title: 'Авито', category: 'guest', mode: 'full' },
      ],
      agents: [
        {
          id: 'channels',
          title: 'Каналы продаж',
          mission: 'Верные цены и наличие на площадках.',
          metrics: ['открытые расхождения'],
          enabled: true,
          duties: [
            {
              id: 'channels.sync',
              title: 'Сверка цен и наличия',
              when: 'Каждое утро',
              does: 'Сверяет',
              wave: 1,
              run: 'browser',
              maxLevel: 'self',
              alwaysOn: false,
              enabled: true,
              level: 'self',
            },
            {
              id: 'channels.fix',
              title: 'Исправление расхождений',
              when: 'После сверки',
              does: 'Исправляет',
              wave: 1,
              run: 'browser',
              maxLevel: 'rule',
              alwaysOn: false,
              enabled: true,
              level: 'approval',
            },
          ],
        },
        {
          id: 'manager',
          title: 'Управляющий',
          mission: 'Говорит с владельцем.',
          metrics: ['сводка вовремя'],
          enabled: false,
          duties: [
            {
              id: 'manager.approvals',
              title: 'Очередь согласований',
              when: 'Постоянно',
              does: 'Очередь',
              wave: 1,
              run: 'code',
              maxLevel: 'self',
              alwaysOn: true,
              enabled: true,
              level: 'self',
            },
            {
              id: 'manager.weekly',
              title: 'Недельный отчёт',
              when: 'По понедельникам',
              does: 'Отчёт',
              wave: 2,
              run: 'code',
              maxLevel: 'self',
              alwaysOn: false,
              enabled: false,
              level: 'off',
              reason: 'включится в волне 2',
            },
          ],
        },
      ],
    },
  };
  approvals = [
    {
      id: 'apr_1',
      agent: 'channels',
      title: 'Исправить расхождения на площадках: 2',
      reason: '2026-10-20 Люкс Островок цена 9000 / 8500',
      cost: null,
      urgent: false,
      action: { kind: 'task', text: 'Исправь на площадках <b>расхождения</b>' },
      createdAt: '2026-10-08T07:00:00.000Z',
    },
  ];
  extensionZip: Buffer | null = Buffer.from('PK\u0003\u0004fake-zip');
  readonly calls: string[] = [];
  private seq = 0;

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    this.calls.push(`${method} ${url.host}${url.pathname}`);
    if (url.host === 'oauth.yandex.test') return this.yandexToken(init);
    if (url.host === 'login.yandex.test') {
      if (headers.get('authorization') !== 'OAuth ya-access-token')
        return json({ error: 'unauthorized' }, 401);
      return json(this.profile);
    }
    if (url.host === 'agent.test') return this.goldfish(method, url, headers, init?.body);
    throw new TypeError(`fetch failed: ${url}`);
  };

  /** Registers a code as Yandex would after the user approves. */
  approve(code: string, challenge: string): void {
    this.codes.set(code, challenge);
  }

  private yandexToken(init?: RequestInit): Response {
    const form = new URLSearchParams(String(init?.body ?? ''));
    const challenge = this.codes.get(form.get('code') ?? '');
    if (
      this.tokenExchangeFails ||
      form.get('grant_type') !== 'authorization_code' ||
      form.get('client_id') !== 'ya-client' ||
      form.get('client_secret') !== 'ya-secret' ||
      !challenge ||
      pkceChallenge(form.get('code_verifier') ?? '') !== challenge
    )
      return json({ error: 'invalid_grant', error_description: 'Code has expired' }, 400);
    this.codes.delete(form.get('code')!);
    return json({ token_type: 'bearer', access_token: 'ya-access-token', expires_in: 3600 });
  }

  private goldfish(method: string, url: URL, headers: Headers, rawBody: unknown): Response {
    if (this.goldfishDown) throw new TypeError('fetch failed: connect ECONNREFUSED');
    const path = url.pathname;
    if (path === '/extension/download') {
      if (!this.extensionZip) return json({ error: 'not_found' }, 404);
      return new Response(new Uint8Array(this.extensionZip), {
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="goldfish-extension-0.1.0.zip"',
        },
      });
    }
    if (headers.get('authorization') !== `Bearer ${ADMIN_TOKEN}`)
      return json({ error: 'unauthorized' }, 401);
    const body = rawBody ? JSON.parse(String(rawBody)) : {};
    let m: RegExpExecArray | null;
    if (method === 'GET' && path === '/admin/clients') return json(this.clients);
    if (method === 'POST' && path === '/admin/clients') {
      const client = { id: `cl_${++this.seq}`, name: body.name };
      this.clients.push(client);
      return json(client, 201);
    }
    if (method === 'POST' && (m = /^\/admin\/clients\/([^/]+)\/users$/.exec(path))) {
      const key = `${m[1]}/${body.userId}`;
      if (this.users.has(key)) return json({ error: 'exists' }, 409);
      this.users.set(key, { displayName: body.displayName });
      return json({ userId: body.userId }, 201);
    }
    if (method === 'PATCH' && (m = /^\/admin\/users\/([^/]+)\/([^/]+)$/.exec(path))) {
      const key = `${m[1]}/${decodeURIComponent(m[2]!)}`;
      const user = this.users.get(key);
      if (!user) return json({ error: 'not_found' }, 404);
      Object.assign(user, body);
      return json(user);
    }
    if (method === 'POST' && (m = /^\/admin\/clients\/([^/]+)\/tokens$/.exec(path))) {
      const id = `tok_${++this.seq}`;
      this.tokens.set(id, { clientId: m[1]!, userId: body.userId, revoked: false });
      return json(
        { token: `gf_secret_${id}`, tokenId: id, clientId: m[1], userId: body.userId },
        201,
      );
    }
    if ((m = /^\/admin\/users\/([^/]+)\/([^/]+)\/hotel(.*)$/.exec(path))) {
      const sub = m[3]!;
      this.hotelCalls.push({
        method,
        path: `${decodeURIComponent(m[2]!)} ${sub}${url.search}`,
        body,
      });
      if (method === 'GET' && sub === '') return json(this.hotel);
      if (method === 'GET' && sub === '/approvals') return json(this.approvals);
      if (method === 'GET' && sub === '/kpi')
        return json({
          units: 2,
          past30: { occupancy: 61.5, adr: 5200, revpar: 3198, directShare: 22 },
          next30: { occupancy: 48 },
          rating: 4.7,
          responseMinutes: 3,
        });
      if (method === 'GET' && sub === '/feed')
        return json([
          {
            kind: 'summary',
            text: 'Доброе утро! Сегодня заездов — 1.',
            createdAt: '2026-10-08T06:00:00.000Z',
          },
        ]);
      if (method === 'POST' && sub === '/settings') {
        const disabling = (
          body.changes as Array<{ op: string; agent?: string; enabled?: boolean }>
        ).some((c) => c.op === 'agent' && c.agent === 'channels' && !c.enabled);
        return json({
          ...this.hotel,
          warnings: disabling
            ? ['«Применение цен»: никто не проверит, что новая цена дошла до площадок.']
            : [],
        });
      }
      if (method === 'POST' && sub.startsWith('/approvals/')) {
        if (sub !== '/approvals/apr_1')
          return json({ error: 'bad_request', message: 'согласование не найдено' }, 400);
        return json({
          ...this.approvals[0],
          status: body.decision === 'reject' ? 'rejected' : 'approved',
        });
      }
      if (method === 'GET' && sub === '/profile/import') return json(this.profileImport);
      if (method === 'POST' && sub === '/profile/import') {
        if (!body.url && !body.text)
          return json(
            { error: 'bad_request', message: 'пришлите ссылку на карточку или её текст' },
            400,
          );
        return json({ ...IMPORT_READY, status: 'reading', fields: [] }, 201);
      }
      if (method === 'GET' && sub === '/profile/import/imp_1') return json(IMPORT_READY);
      if (method === 'POST' && sub === '/profile/import/imp_1/apply')
        return json({ ...this.hotel, applied: ['Название'] });
      if (method === 'POST' && sub === '/profile/import/imp_1/discard') return json({ ok: true });
      if (method === 'POST' && sub === '/duties/channels.sync/run') {
        if (!body.grant)
          return json({
            status: 'нужно разрешение: агент выключен',
            permission: {
              duty: 'channels.sync',
              dutyTitle: 'Сверка цен и наличия',
              agent: 'channels',
              agentTitle: 'Каналы продаж',
              reason: 'агент выключен',
              level: 'self',
              changes: [{ op: 'agent', agent: 'channels', enabled: true }],
              text: 'Агент «Каналы продаж» не может выполнить «Сверка цен и наличия» без вашего разрешения: агент выключен.',
            },
          });
        return json({ status: 'задание запущено' });
      }
      if (method === 'POST' && sub === '/telegram/link')
        return json({
          code: 'ABCD2345',
          link: 'https://t.me/gf_bot?start=ABCD2345',
          expiresInSec: 1800,
        });
      if (method === 'POST' && sub === '/hook-token')
        return json({
          token: 'gfh_x',
          events: '/hotel/hooks/gfh_x/events',
          email: '/hotel/hooks/gfh_x/email',
        });
      if (method === 'PUT' && sub === '/profile') {
        if (!body.name) return json({ error: 'bad_request', message: 'name: обязательно' }, 400);
        return json(this.hotel);
      }
      return json({ error: 'not_found' }, 404);
    }
    if (method === 'DELETE' && (m = /^\/admin\/tokens\/([^/]+)$/.exec(path))) {
      const token = this.tokens.get(m[1]!);
      if (!token) return new Response(null, { status: 404 });
      token.revoked = true;
      return new Response(null, { status: 204 });
    }
    return json({ error: 'not_found' }, 404);
  }

  activeTokens(): string[] {
    return [...this.tokens].filter(([, t]) => !t.revoked).map(([id]) => id);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export interface TestApp {
  app: FastifyInstance;
  services: Services;
  fakes: Fakes;
  store: Store;
}

export async function startApp(
  env: Record<string, string> = {},
  store: Store = new MemoryStore(),
): Promise<TestApp> {
  const fakes = new Fakes();
  const services = await createServices(testConfig(env), pino({ level: 'silent' }), {
    store,
    fetch: fakes.fetch,
  });
  const app = await buildApp(services);
  await app.ready();
  return { app, services, fakes, store };
}

/** Walks the whole Yandex sign-in and returns the session cookie. */
export async function signIn(t: TestApp): Promise<Record<string, string>> {
  const start = await t.app.inject('/auth/yandex');
  const location = new URL(String(start.headers.location));
  const oauth = start.cookies.find((c) => c.name === t.services.sessions.names.oauth)!;
  t.fakes.approve('auth-code', location.searchParams.get('code_challenge')!);
  const callback = await t.app.inject({
    url: `/auth/yandex/callback?code=auth-code&state=${location.searchParams.get('state')}`,
    cookies: { [oauth.name]: oauth.value },
  });
  const session = callback.cookies.find((c) => c.name === t.services.sessions.names.session);
  if (!session)
    throw new Error(`sign-in failed: ${callback.statusCode} ${callback.headers.location}`);
  return { [session.name]: session.value };
}

export async function sessionUser(
  t: TestApp,
  cookies: Record<string, string>,
): Promise<UserRecord> {
  const user = await t.store.sessionUser(sha256(Object.values(cookies)[0]!));
  if (!user) throw new Error('no session');
  return user;
}
