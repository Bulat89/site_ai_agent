import cookie from '@fastify/cookie';
import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';
import { accessOf } from './access.js';
import { isSecure } from './config.js';
import { openExtension } from './extension.js';
import { renderNotFound, renderPage, type Notice } from './pages/page.js';
import type { Services } from './services.js';
import { registerStatic } from './static.js';

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

  app.get('/', async (req, reply) => {
    const user = await sessions.user(req);
    const q = req.query as { login?: string; download?: string };
    const notice: Notice | null =
      (q.login && NOTICES[q.login]) ||
      (q.download === 'unavailable' ? 'download_unavailable' : null);
    return reply
      .type('text/html; charset=utf-8')
      .header('cache-control', 'private, no-store')
      .send(renderPage({ ...view, user, access: user ? accessOf(user) : null, notice }));
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

  app.setNotFoundHandler(async (_req, reply) =>
    reply.code(404).type('text/html; charset=utf-8').send(renderNotFound(view)),
  );

  return app;
}
