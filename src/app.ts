import cookie from '@fastify/cookie';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';
import { accessOf, goldfishUserId } from './access.js';
import { isSecure } from './config.js';
import { openExtension } from './extension.js';
import { GoldfishError } from './goldfish/admin.js';
import { renderHelp } from './pages/help.js';
import {
  AGENT_TABS,
  renderNotFound,
  renderPage,
  type AgentTab,
  type Notice,
} from './pages/page.js';
import { renderPrices, type PriceBoardView } from './pages/prices.js';
import {
  deskFromParts,
  renderAgents,
  statusStrip,
  tabCount,
  todayPanel,
  type AgentsState,
  type ApprovalView,
  type DeskView,
  type FeedItem,
  type HotelView,
  type KpiView,
  type ProfileImportView,
  type ListingSearchView,
  type CompetitorSearchView,
} from './pages/agents.js';
import type { BotsState } from './pages/bots.js';
import type { Services } from './services.js';
import { registerStatic } from './static.js';
import type { UserRecord } from './store/types.js';

const NOTICES: Record<string, Notice> = {
  denied: 'login_denied',
  expired: 'login_expired',
  error: 'login_error',
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' https://avatars.yandex.net data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

/**
 * A restart of the Goldfish server: its proxy answers 502–504 for some 20 s on a deploy, longer
 * than the retries of a read. The pages say so and ask again; it is not an error for the journal.
 */
const restarting = (err: unknown): err is GoldfishError =>
  err instanceof GoldfishError && !!err.status && err.status >= 502 && err.status <= 504;
/** A page that met the restart reloads itself after this many seconds (the Refresh header). */
const RELOAD_SECONDS = 15;
const RESTARTING_NOTICE = `Сервер агентов перезапускается — страница обновится сама через ${RELOAD_SECONDS} с.`;

export async function buildApp(s: Services): Promise<FastifyInstance> {
  const { config, sessions, store } = s;
  const app = Fastify({ loggerInstance: s.log as FastifyBaseLogger, trustProxy: true });
  await app.register(cookie);
  // The logout form posts urlencoded; nothing in its body is used.
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, _body, done) => done(null, {}),
  );

  const origin = new URL(config.PUBLIC_URL).origin;
  const secure = isSecure(config);
  /** State-changing requests must come from this site's own pages. */
  const sameOrigin = (req: FastifyRequest) => req.headers.origin === origin;

  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'same-origin');
    reply.header('x-frame-options', 'DENY');
    reply.header('content-security-policy', CSP);
    if (secure) reply.header('strict-transport-security', 'max-age=31536000');
  });

  const assets = registerStatic(app);
  const view = {
    assets,
    goldfishUrl: config.GOLDFISH_URL,
    privacyUrl: config.PRIVACY_URL,
    supportEmail: config.SUPPORT_EMAIL,
  };

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async (_req, reply) => {
    try {
      await store.ping();
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  /**
   * The owner's bots in the messengers for a page: fresh one-time codes for the QR codes and the
   * chats already linked. Undefined without a bots server; a silent one is «unavailable» and the
   * page renders without the codes.
   */
  const botsOf = async (
    user: UserRecord,
    req: FastifyRequest,
    codes = true,
  ): Promise<BotsState | undefined> => {
    if (!s.bots) return undefined;
    try {
      const owner = { clientId: await s.goldfish.clientId(), userId: goldfishUserId(user) };
      return await s.bots.view(owner, codes);
    } catch (err) {
      req.log.warn({ err }, 'bots server unavailable: the page goes without QR codes');
      return 'unavailable';
    }
  };

  app.get('/', async (req, reply) => {
    const user = await sessions.user(req);
    const q = req.query as { login?: string; download?: string };
    const notice: Notice | null =
      (q.login && NOTICES[q.login]) ||
      (q.download === 'unavailable' ? 'download_unavailable' : null);
    const access = user ? accessOf(user) : null;
    const bots = user && access?.allowed ? await botsOf(user, req) : undefined;
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'private, no-store')
      .send(renderPage({ ...view, user, access, notice, bots }));
  });

  // The guide is public: it also answers «how does it work» before signing in.
  app.get('/help', async (req, reply) => {
    const user = await sessions.user(req);
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'private, no-cache')
      .send(renderHelp({ ...view, user }));
  });

  // ---------------------------------------------------------------- Yandex ID

  app.get('/auth/yandex', async (req, reply) => {
    if (await sessions.user(req)) return reply.redirect('/');
    const { state, verifier } = sessions.beginOAuth(reply);
    return reply
      .header('cache-control', 'no-store')
      .redirect(s.yandex.authorizeUrl(state, verifier));
  });

  app.get('/auth/yandex/callback', async (req, reply) => {
    const q = req.query as { code?: string; state?: string; error?: string };
    const verifier = sessions.finishOAuth(req, reply, q.state);
    if (q.error) {
      req.log.info({ error: q.error }, 'yandex sign-in declined');
      return reply.redirect('/?login=denied');
    }
    if (!verifier || !q.code) return reply.redirect('/?login=expired');
    try {
      const accessToken = await s.yandex.exchange(q.code, verifier);
      const profile = await s.yandex.profile(accessToken);
      const user = await store.upsertYandexUser(profile);
      await sessions.start(reply, user.id);
      req.log.info({ userId: user.id }, 'signed in');
      return reply.redirect('/');
    } catch (err) {
      req.log.error({ err }, 'yandex sign-in failed');
      return reply.redirect('/?login=error');
    }
  });

  app.post('/logout', async (req, reply) => {
    if (!sameOrigin(req)) return reply.code(403).send({ error: 'forbidden' });
    await sessions.end(req, reply);
    return reply.redirect('/', 303);
  });

  // ---------------------------------------------------------------- access

  app.get('/download', async (req, reply) => {
    const user = await sessions.user(req);
    if (!user) return reply.redirect('/auth/yandex');
    if (!accessOf(user).allowed) return reply.redirect('/');
    try {
      const pkg = await openExtension(config, s.goldfish);
      if (pkg) {
        void store
          .markDownload(user.id)
          .catch((err: unknown) => req.log.warn({ err }, 'download not recorded'));
        if (pkg.length !== null) reply.header('content-length', pkg.length);
        return reply
          .type('application/zip')
          .header('content-disposition', `attachment; filename="${pkg.filename}"`)
          .send(pkg.body);
      }
      req.log.warn('extension package is not available');
    } catch (err) {
      req.log.error({ err }, 'extension download failed');
    }
    return reply.redirect('/?download=unavailable');
  });

  app.post('/api/token', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!sameOrigin(req)) return reply.code(403).send({ error: 'forbidden' });
    const user = await sessions.user(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: 'Войдите заново' });
    const access = accessOf(user);
    if (!access.allowed)
      return reply.code(403).send({ error: 'no_access', message: access.reason });
    try {
      const { token, user: updated } = await s.access.issueToken(user.id);
      req.log.info({ userId: user.id }, 'device token issued');
      return { token, serverUrl: config.GOLDFISH_URL, issuedAt: updated.tokenIssuedAt };
    } catch (err) {
      req.log.error({ err }, 'device token not issued');
      return reply.code(502).send({
        error: 'goldfish_unavailable',
        message: 'Сервер агента сейчас недоступен — попробуйте через минуту',
      });
    }
  });

  // ---------------------------------------------------------------- hotel agents

  /**
   * «Пульт управляющего» — the same state the extension and the bots show. An older Goldfish
   * without it (404) gives the parts separately, and the page makes the desk of them.
   */
  const loadDesk = async (
    gf: string,
    hotel: HotelView,
    desk: { status: number; body: DeskView },
  ): Promise<DeskView> => {
    if (desk.status === 200) return desk.body;
    const [approvals, kpi, feed] = await Promise.all([
      s.goldfish.hotel<ApprovalView[]>(gf, 'GET', '/approvals?status=pending'),
      s.goldfish.hotel<KpiView>(gf, 'GET', '/kpi'),
      s.goldfish.hotel<FeedItem[]>(gf, 'GET', '/feed?limit=20'),
    ]);
    return deskFromParts(
      hotel,
      approvals.status === 200 ? approvals.body : [],
      kpi.status === 200 ? kpi.body : null,
      feed.status === 200 ? feed.body : [],
    );
  };

  const EMPTY_DESK: DeskView = {
    rev: '',
    status: { agentsOn: 0, agentsTotal: 0, wave: 1, pending: 0, urgent: 0 },
    approvals: [],
    decided: [],
    feed: [],
    kpi: null,
  };

  app.get('/agents', async (req, reply) => {
    const user = await sessions.user(req);
    if (!user) return reply.redirect('/auth/yandex');
    if (!accessOf(user).allowed) return reply.redirect('/');
    const gf = goldfishUserId(user);
    const tab = (req.query as { tab?: string }).tab;
    let state: AgentsState = {
      ...view,
      user,
      tab: AGENT_TABS.includes(tab as AgentTab) ? (tab as AgentTab) : 'today',
      hotel: null,
      desk: EMPTY_DESK,
      error: null,
    };
    const bots = botsOf(user, req);
    try {
      const [hotel, desk, profileImport, listings, competitorSearch] = await Promise.all([
        s.goldfish.hotel<HotelView>(gf, 'GET', ''),
        s.goldfish.hotel<DeskView>(gf, 'GET', '/manager'),
        s.goldfish.hotel<ProfileImportView | null>(gf, 'GET', '/profile/import'),
        s.goldfish.hotel<ListingSearchView | null>(gf, 'GET', '/listings'),
        s.goldfish.hotel<CompetitorSearchView | null>(gf, 'GET', '/competitors'),
      ]);
      if (hotel.status !== 200) throw new Error(`hotel: ${hotel.status}`);
      state = {
        ...state,
        hotel: hotel.body,
        desk: await loadDesk(gf, hotel.body, desk),
        profileImport: profileImport.status === 200 ? profileImport.body : null,
        // An older Goldfish without the searches answers 404: the blocks offer to start them.
        listings: listings.status === 200 ? listings.body : null,
        competitorSearch: competitorSearch.status === 200 ? competitorSearch.body : null,
      };
    } catch (err) {
      // 2026-10-14 16:38: the deploy of Goldfish gave the page «unavailable» and the journal an error.
      if (restarting(err)) {
        req.log.info({ status: err.status }, 'agents page: goldfish restarting, the page reloads');
        reply.header('refresh', String(RELOAD_SECONDS));
        state.error = RESTARTING_NOTICE;
      } else {
        req.log.error({ err }, 'agents page: goldfish unavailable');
        state.error = 'Сервер агентов сейчас недоступен — попробуйте через минуту.';
      }
    }
    state.bots = await bots;
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'private, no-store')
      .send(renderAgents(state));
  });

  // «Цены»: the direct competitors' prices with proofs and the recommendation.
  app.get('/agents/prices', async (req, reply) => {
    const user = await sessions.user(req);
    if (!user) return reply.redirect('/auth/yandex');
    if (!accessOf(user).allowed) return reply.redirect('/');
    const gf = goldfishUserId(user);
    let state: Parameters<typeof renderPrices>[0] = {
      ...view,
      user,
      hotelName: null,
      board: null,
      error: null,
    };
    try {
      const [hotel, board] = await Promise.all([
        s.goldfish.hotel<HotelView>(gf, 'GET', ''),
        s.goldfish.hotel<PriceBoardView>(gf, 'GET', '/prices'),
      ]);
      // An older Goldfish has no «Цены» yet: say so rather than «unavailable».
      if (board.status === 404) {
        state.error = 'Сервер агентов ещё не умеет считать цены конкурентов — его нужно обновить.';
        return reply
          .type('text/html; charset=utf-8')
          .header('cache-control', 'private, no-store')
          .send(renderPrices(state));
      }
      if (board.status !== 200) throw new Error(`prices: ${board.status}`);
      state = {
        ...state,
        hotelName: hotel.status === 200 ? String(hotel.body.profile.name ?? '') || null : null,
        board: board.body,
      };
    } catch (err) {
      if (restarting(err)) {
        req.log.info({ status: err.status }, 'prices page: goldfish restarting, the page reloads');
        reply.header('refresh', String(RELOAD_SECONDS));
        state.error = RESTARTING_NOTICE;
      } else {
        req.log.error({ err }, 'prices page: goldfish unavailable');
        state.error = 'Сервер агентов сейчас недоступен — попробуйте через минуту.';
      }
    }
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'private, no-store')
      .send(renderPrices(state));
  });

  /**
   * Changes from the agents page, proxied to Goldfish on the owner's behalf. Only from this site's
   * pages, only for a signed-in user with access; the server's refusals come back as they are.
   */
  const proxy =
    (
      method: 'POST' | 'PUT',
      path: (req: FastifyRequest) => string,
      body: (b: Record<string, unknown>) => unknown = (b) => b,
    ) =>
    async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
      reply.header('cache-control', 'no-store');
      if (!sameOrigin(req)) return reply.code(403).send({ error: 'forbidden' });
      const user = await sessions.user(req);
      if (!user) return reply.code(401).send({ error: 'unauthorized', message: 'Войдите заново' });
      const access = accessOf(user);
      if (!access.allowed)
        return reply.code(403).send({ error: 'no_access', message: access.reason });
      try {
        const res = await s.goldfish.hotel(
          goldfishUserId(user),
          method,
          path(req),
          body((req.body ?? {}) as Record<string, unknown>),
        );
        return reply.code(res.status).send(res.body);
      } catch (err) {
        req.log.error({ err }, 'agents change: goldfish unavailable');
        return reply.code(502).send({
          error: 'goldfish_unavailable',
          message: 'Сервер агентов сейчас недоступен — попробуйте через минуту',
        });
      }
    };
  const id = (req: FastifyRequest) => encodeURIComponent((req.params as { id: string }).id);
  app.post(
    '/api/agents/settings',
    proxy('POST', () => '/settings'),
  );
  // The decision is marked as taken on the site: the extension and the bots say where.
  app.post(
    '/api/agents/approvals/:id',
    proxy(
      'POST',
      (req) => `/approvals/${id(req)}`,
      (b) => ({ ...b, via: 'site' }),
    ),
  );
  app.post(
    '/api/agents/telegram',
    proxy('POST', () => '/telegram/link'),
  );

  // «Сегодня» asks for itself again while it is open: a decision taken in a messenger or in the
  // extension, a new approval or message shows without a reload. A read: the session is enough.
  app.get('/api/agents/today', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const user = await sessions.user(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: 'Войдите заново' });
    if (!accessOf(user).allowed) return reply.code(403).send({ error: 'no_access' });
    const gf = goldfishUserId(user);
    try {
      // The chats linked, without fresh link codes: those are made only for the QR codes.
      const [hotel, desk, bots] = await Promise.all([
        s.goldfish.hotel<HotelView>(gf, 'GET', ''),
        s.goldfish.hotel<DeskView>(gf, 'GET', '/manager'),
        botsOf(user, req, false),
      ]);
      if (hotel.status !== 200) throw new Error(`hotel: ${hotel.status}`);
      const st = { hotel: hotel.body, desk: await loadDesk(gf, hotel.body, desk), bots };
      return {
        rev: st.desk.rev,
        pending: st.desk.status.pending,
        urgent: st.desk.status.urgent,
        today: todayPanel(st),
        strip: statusStrip(st),
        count: tabCount(st.desk.status),
      };
    } catch (err) {
      // The page asks again in a while: a restart of Goldfish is a missed tick.
      if (restarting(err))
        req.log.info({ status: err.status }, 'agents today: goldfish restarting');
      else req.log.warn({ err }, 'agents today: goldfish unavailable');
      return reply.code(502).send({ error: 'goldfish_unavailable' });
    }
  });

  app.post(
    '/api/agents/hook-token',
    proxy('POST', () => '/hook-token'),
  );
  app.post(
    '/api/agents/duties/:id/run',
    proxy('POST', (req) => `/duties/${id(req)}/run`),
  );
  app.post(
    '/api/agents/profile/import',
    proxy('POST', () => '/profile/import'),
  );
  app.post(
    '/api/agents/profile/import/:id/apply',
    proxy('POST', (req) => `/profile/import/${id(req)}/apply`),
  );
  app.post(
    '/api/agents/profile/import/:id/discard',
    proxy('POST', (req) => `/profile/import/${id(req)}/discard`),
  );
  // Polled by the page while the agent reads a card. A read: same-origin fetch sends no Origin
  // for GET, so only the session is checked.
  app.get('/api/agents/profile/import/:id', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    const user = await sessions.user(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: 'Войдите заново' });
    if (!accessOf(user).allowed) return reply.code(403).send({ error: 'no_access' });
    try {
      const res = await s.goldfish.hotel(goldfishUserId(user), 'GET', `/profile/import/${id(req)}`);
      return reply.code(res.status).send(res.body);
    } catch (err) {
      // The page asks again in 5 s: a restart of the Goldfish server that outlasts the retries
      // of a read (502 for some 20 s at 11:59) is a missed tick, not an error for the journal.
      if (restarting(err))
        req.log.info(
          { status: err.status },
          'agents import: goldfish restarting, the page asks again',
        );
      else req.log.error({ err }, 'agents import: goldfish unavailable');
      return reply.code(502).send({ error: 'goldfish_unavailable' });
    }
  });
  app.put(
    '/api/agents/profile',
    proxy('PUT', () => '/profile'),
  );
  // After the reference: listings on the platforms and competitors nearby.
  const platform = (req: FastifyRequest) =>
    encodeURIComponent((req.params as { platform: string }).platform);
  app.post(
    '/api/agents/next-steps',
    proxy('POST', () => '/next-steps'),
  );
  app.post(
    '/api/agents/listings',
    proxy('POST', () => '/listings'),
  );
  app.post(
    '/api/agents/listings/sync',
    proxy('POST', () => '/listings/sync'),
  );
  app.post(
    '/api/agents/listings/manual',
    proxy('POST', () => '/listings/manual'),
  );
  app.post(
    '/api/agents/listings/:id/:platform',
    proxy('POST', (req) => `/listings/${id(req)}/${platform(req)}`),
  );
  app.post(
    '/api/agents/listings/:id/:platform/publish',
    proxy('POST', (req) => `/listings/${id(req)}/${platform(req)}/publish`),
  );
  app.post(
    '/api/agents/competitors',
    proxy('POST', () => '/competitors'),
  );
  app.post(
    '/api/agents/competitors/candidates/:id',
    proxy('POST', (req) => `/competitors/candidates/${id(req)}`),
  );
  app.post(
    '/api/agents/prices/accept',
    proxy('POST', () => '/prices/accept'),
  );
  // Polled by the page while a search runs (a read: the session is enough).
  for (const what of ['listings', 'competitors'] as const)
    app.get(`/api/agents/${what}`, async (req, reply) => {
      reply.header('cache-control', 'no-store');
      const user = await sessions.user(req);
      if (!user) return reply.code(401).send({ error: 'unauthorized', message: 'Войдите заново' });
      if (!accessOf(user).allowed) return reply.code(403).send({ error: 'no_access' });
      try {
        const res = await s.goldfish.hotel(goldfishUserId(user), 'GET', `/${what}`);
        return reply.code(res.status).send(res.body);
      } catch (err) {
        // Asked again in 5 s, like the card import: a Goldfish restart is a missed tick.
        if (restarting(err))
          req.log.info(
            { status: err.status },
            'agents search: goldfish restarting, the page asks again',
          );
        else req.log.error({ err }, 'agents search: goldfish unavailable');
        return reply.code(502).send({ error: 'goldfish_unavailable' });
      }
    });

  // A chat linked to a bot, unlinked from the agents page (only the owner's own chats).
  app.post('/api/bots/unlink', async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!sameOrigin(req)) return reply.code(403).send({ error: 'forbidden' });
    const user = await sessions.user(req);
    if (!user) return reply.code(401).send({ error: 'unauthorized', message: 'Войдите заново' });
    if (!s.bots) return reply.code(404).send({ error: 'not_found' });
    const body = (req.body ?? {}) as { channel?: unknown; chatId?: unknown };
    if (
      typeof body.channel !== 'string' ||
      typeof body.chatId !== 'string' ||
      !body.channel ||
      !body.chatId ||
      body.channel.length > 40 ||
      body.chatId.length > 100
    )
      return reply.code(400).send({ error: 'bad_request', message: 'какой чат отвязать?' });
    try {
      const owner = { clientId: await s.goldfish.clientId(), userId: goldfishUserId(user) };
      if (!(await s.bots.unlink(owner, body.channel, body.chatId)))
        return reply.code(404).send({ error: 'not_found', message: 'Этот чат уже отвязан' });
      req.log.info({ userId: user.id, channel: body.channel }, 'bot chat unlinked');
      return { ok: true };
    } catch (err) {
      req.log.error({ err }, 'bots unlink: bots server unavailable');
      return reply.code(502).send({
        error: 'bots_unavailable',
        message: 'Сервер ботов сейчас недоступен — попробуйте через минуту',
      });
    }
  });

  app.setNotFoundHandler(async (_req, reply) =>
    reply.code(404).type('text/html; charset=utf-8').send(renderNotFound(view)),
  );

  return app;
}
