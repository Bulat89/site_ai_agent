import type { Config } from './config.js';

/** A Goldfish user on whose behalf the bots act. */
export interface BotOwner {
  clientId: string;
  userId: string;
}

/** A chat of the owner linked to a bot. */
export interface BotLink {
  channel: string;
  title: string;
  chatId: string;
  name: string | null;
  linkedAt: string;
}

/** A one-time code for a QR code: the link opens the bot in its messenger and hands it the code. */
export interface BotOffer {
  channel: string;
  title: string;
  url: string;
  code: string;
}

export interface BotsView {
  channels: Array<{ id: string; title: string }>;
  links: BotLink[];
  offers: BotOffer[];
  expiresAt: string | null;
}

export class BotsError extends Error {
  override readonly name = 'BotsError';
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** The cabinet waits for the bots server this long at most: the page renders without the QR codes. */
const TIMEOUT_MS = 5_000;
const enc = encodeURIComponent;

/**
 * Client of the bots server (repository tg_goldfish): link codes for the QR codes of the cabinet,
 * the chats already linked, unlinking a chat.
 */
export class BotsClient {
  constructor(
    private readonly config: { BOTS_URL: string; BOTS_API_TOKEN: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call<T>(method: string, path: string): Promise<{ status: number; body: T }> {
    let res: Response;
    try {
      res = await this.fetchFn(new URL(path, this.config.BOTS_URL), {
        method,
        headers: { authorization: `Bearer ${this.config.BOTS_API_TOKEN}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new BotsError(`${method} ${path}: ${(err as Error).message}`);
    }
    if (res.status >= 500 || res.status === 401)
      throw new BotsError(`${method} ${path}: ${res.status}`, res.status);
    const text = await res.text();
    return { status: res.status, body: (text ? JSON.parse(text) : {}) as T };
  }

  private path(o: BotOwner): string {
    return `/api/owners/${enc(o.clientId)}/${enc(o.userId)}`;
  }

  /** The messengers, the owner's linked chats and, with `codes`, fresh codes for the QR codes. */
  async view(o: BotOwner, codes: boolean): Promise<BotsView> {
    const [state, offers] = await Promise.all([
      this.call<{ channels: BotsView['channels']; links: BotLink[] }>('GET', this.path(o)),
      codes
        ? this.call<{ expiresAt: string; offers: BotOffer[] }>('POST', `${this.path(o)}/codes`)
        : Promise.resolve(null),
    ]);
    if (state.status !== 200) throw new BotsError(`owner: ${state.status}`, state.status);
    if (offers && offers.status !== 201)
      throw new BotsError(`codes: ${offers.status}`, offers.status);
    return {
      channels: state.body.channels,
      links: state.body.links,
      offers: offers?.body.offers ?? [],
      expiresAt: offers?.body.expiresAt ?? null,
    };
  }

  /** False when there is no such chat of the owner. */
  async unlink(o: BotOwner, channel: string, chatId: string): Promise<boolean> {
    const r = await this.call('DELETE', `${this.path(o)}/links/${enc(channel)}/${enc(chatId)}`);
    return r.status === 204;
  }
}

export function createBots(
  config: Pick<Config, 'BOTS_URL' | 'BOTS_API_TOKEN'>,
  fetchFn?: typeof fetch,
): BotsClient | null {
  if (!config.BOTS_URL || !config.BOTS_API_TOKEN) return null;
  return new BotsClient(
    { BOTS_URL: config.BOTS_URL, BOTS_API_TOKEN: config.BOTS_API_TOKEN },
    fetchFn,
  );
}
