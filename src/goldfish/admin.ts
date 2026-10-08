import type { Config } from '../config.js';

export class GoldfishError extends Error {
  override readonly name = 'GoldfishError';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 15_000;

/**
 * Client of the Goldfish server's admin API (docs/protocol.md in the goldfish repository).
 * Site users live in one Goldfish client (company); each gets a device token for the extension.
 */
export class GoldfishAdmin {
  private clientIdPromise: Promise<string> | undefined;

  constructor(
    private readonly config: Pick<
      Config,
      'GOLDFISH_ADMIN_URL' | 'GOLDFISH_ADMIN_TOKEN' | 'GOLDFISH_CLIENT_ID' | 'GOLDFISH_CLIENT_NAME'
    >,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call(method: string, path: string, body?: unknown): Promise<Response> {
    try {
      return await this.fetchFn(new URL(path, this.config.GOLDFISH_ADMIN_URL), {
        method,
        headers: {
          authorization: `Bearer ${this.config.GOLDFISH_ADMIN_TOKEN}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new GoldfishError(`${method} ${path}: ${(err as Error).message}`);
    }
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.call(method, path, body);
    if (!res.ok) throw new GoldfishError(`${method} ${path}: ${res.status}`, res.status);
    return (await res.json()) as T;
  }

  /** GOLDFISH_CLIENT_ID, or the client named GOLDFISH_CLIENT_NAME (created when missing). */
  clientId(): Promise<string> {
    if (this.config.GOLDFISH_CLIENT_ID) return Promise.resolve(this.config.GOLDFISH_CLIENT_ID);
    this.clientIdPromise ??= (async () => {
      const name = this.config.GOLDFISH_CLIENT_NAME;
      const clients = await this.json<Array<{ id: string; name: string }>>('GET', '/admin/clients');
      const found = clients.find((c) => c.name === name);
      if (found) return found.id;
      return (await this.json<{ id: string }>('POST', '/admin/clients', { name })).id;
    })().catch((err: unknown) => {
      this.clientIdPromise = undefined;
      throw err;
    });
    return this.clientIdPromise;
  }

  /** Creates the user in Goldfish or refreshes their display name. */
  async ensureUser(userId: string, displayName: string): Promise<void> {
    const clientId = await this.clientId();
    const res = await this.call('POST', `/admin/clients/${enc(clientId)}/users`, {
      userId,
      displayName,
    });
    if (res.status === 201) return;
    if (res.status !== 409) throw new GoldfishError(`create user: ${res.status}`, res.status);
    await this.json('PATCH', `/admin/users/${enc(clientId)}/${enc(userId)}`, { displayName });
  }

  /** A new device token; the plaintext is returned once and never stored by the site. */
  async issueToken(userId: string, label: string): Promise<{ token: string; tokenId: string }> {
    const clientId = await this.clientId();
    const res = await this.json<{ token: string; tokenId: string }>(
      'POST',
      `/admin/clients/${enc(clientId)}/tokens`,
      { userId, label },
    );
    return { token: res.token, tokenId: res.tokenId };
  }

  /** Revokes a token; a token that no longer exists counts as revoked. */
  async revokeToken(tokenId: string): Promise<void> {
    const res = await this.call('DELETE', `/admin/tokens/${enc(tokenId)}`);
    if (res.status !== 204 && res.status !== 404)
      throw new GoldfishError(`revoke token: ${res.status}`, res.status);
  }

  /**
   * The hotel agents of a site user (goldfish /admin/users/:clientId/:userId/hotel…): the site
   * acts on the owner's behalf. Expected refusals (400) come back with the server's message.
   */
  async hotel<T = unknown>(
    userId: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; body: T }> {
    const clientId = await this.clientId();
    const res = await this.call(
      method,
      `/admin/users/${enc(clientId)}/${enc(userId)}/hotel${path}`,
      body,
    );
    if (res.status >= 500 || res.status === 401)
      throw new GoldfishError(`${method} hotel${path}: ${res.status}`, res.status);
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as T };
  }

  /** The extension zip the Goldfish server hands out (public endpoint). */
  async extensionPackage(): Promise<Response> {
    try {
      return await this.fetchFn(new URL('/extension/download', this.config.GOLDFISH_ADMIN_URL), {
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      throw new GoldfishError(`extension download: ${(err as Error).message}`);
    }
  }
}

const enc = encodeURIComponent;
