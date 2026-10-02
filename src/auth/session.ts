import { timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Store, UserRecord } from '../store/types.js';
import { randomToken, sha256 } from '../util/crypto.js';

export interface CookieNames {
  session: string;
  oauth: string;
}

/**
 * Over https cookies get the __Host- prefix: Secure, host-only and Path=/, so a sibling
 * subdomain cannot plant a session or an OAuth state.
 */
export function cookieNames(secure: boolean): CookieNames {
  const prefix = secure ? '__Host-' : '';
  return { session: `${prefix}gf_session`, oauth: `${prefix}gf_oauth` };
}

const OAUTH_TTL_S = 10 * 60;

export class Sessions {
  readonly names: CookieNames;

  constructor(
    private readonly store: Store,
    private readonly secure: boolean,
    private readonly days: number,
  ) {
    this.names = cookieNames(secure);
  }

  private options(maxAge: number) {
    return { path: '/', httpOnly: true, sameSite: 'lax' as const, secure: this.secure, maxAge };
  }

  async start(reply: FastifyReply, userId: string): Promise<void> {
    const id = randomToken();
    const maxAge = this.days * 86_400;
    await this.store.createSession(sha256(id), userId, new Date(Date.now() + maxAge * 1000));
    reply.setCookie(this.names.session, id, this.options(maxAge));
  }

  async user(req: FastifyRequest): Promise<UserRecord | null> {
    const id = req.cookies[this.names.session];
    if (!id || id.length > 100) return null;
    return this.store.sessionUser(sha256(id));
  }

  async end(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const id = req.cookies[this.names.session];
    if (id && id.length <= 100) await this.store.deleteSession(sha256(id));
    reply.clearCookie(this.names.session, this.options(0));
  }

  /** Remembers the OAuth state and PKCE verifier until the callback. */
  beginOAuth(reply: FastifyReply): { state: string; verifier: string } {
    const state = randomToken(24);
    const verifier = randomToken(48);
    reply.setCookie(this.names.oauth, `${state}.${verifier}`, this.options(OAUTH_TTL_S));
    return { state, verifier };
  }

  /** The PKCE verifier when `state` matches the one this browser started with; clears it. */
  finishOAuth(req: FastifyRequest, reply: FastifyReply, state: string | undefined): string | null {
    const raw = req.cookies[this.names.oauth];
    reply.clearCookie(this.names.oauth, this.options(0));
    if (!raw || !state) return null;
    const [expected, verifier] = raw.split('.');
    if (!expected || !verifier) return null;
    const a = Buffer.from(expected);
    const b = Buffer.from(state);
    return a.length === b.length && timingSafeEqual(a, b) ? verifier : null;
  }
}
