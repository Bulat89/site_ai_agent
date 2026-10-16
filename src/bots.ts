import QRCode from 'qrcode';
import type { Config } from './config.js';

/** A chat of the owner linked to the bots (Telegram, MAX, WhatsApp). */
export interface MessengerLink {
  channel: string;
  title: string;
  chatId: string;
  name: string | null;
  linkedAt: string;
}

/** The messengers the bots server works in and the owner's chats there. */
export interface MessengersView {
  channels: Array<{ id: string; title: string }>;
  links: MessengerLink[];
}

/** A one-time code for one messenger: the link the QR code opens. */
export interface LinkOffer {
  channel: string;
  title: string;
  url: string;
  code: string;
  /** The QR code of `url` as a data: image (the page's CSP allows data: images only). */
  qr: string;
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

const TIMEOUT_MS = 10_000;
const enc = encodeURIComponent;

/**
 * Client of the bots server (repository tg_goldfish): the cabinet shows QR codes that link the
 * owner's Telegram, MAX or WhatsApp to the manager agent, and the chats already linked.
 */
export class BotsClient {
  constructor(
    private readonly config: { url: string; token: string },
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async call<T>(method: string, path: string): Promise<{ status: number; body: T }> {
    let res: Response;
    try {
      res = await this.fetchFn(new URL(path, this.config.url), {
        method,
        headers: { authorization: `Bearer ${this.config.token}` },
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

  private owner(clientId: string, userId: string): string {
    return `/api/owners/${enc(clientId)}/${enc(userId)}`;
  }

  async messengers(clientId: string, userId: string): Promise<MessengersView> {
    const r = await this.call<MessengersView>('GET', this.owner(clientId, userId));
    if (r.status !== 200) throw new BotsError(`owner: ${r.status}`, r.status);
    return r.body;
  }

  /** Fresh one-time codes, one per messenger, with their QR codes. */
  async codes(
    clientId: string,
    userId: string,
  ): Promise<{ expiresAt: string; offers: LinkOffer[] }> {
    const r = await this.call<{ expiresAt: string; offers: Array<Omit<LinkOffer, 'qr'>> }>(
      'POST',
      `${this.owner(clientId, userId)}/codes`,
    );
    if (r.status !== 201) throw new BotsError(`codes: ${r.status}`, r.status);
    const offers = await Promise.all(
      r.body.offers.map(async (o) => ({
        ...o,
        qr: await QRCode.toDataURL(o.url, { margin: 1, width: 240, errorCorrectionLevel: 'M' }),
      })),
    );
    return { expiresAt: r.body.expiresAt, offers };
  }

  /** false — no such chat of this owner. */
  async unlink(clientId: string, userId: string, channel: string, chatId: string) {
    const r = await this.call(
      'DELETE',
      `${this.owner(clientId, userId)}/links/${enc(channel)}/${enc(chatId)}`,
    );
    return r.status === 204;
  }
}

export function botsClient(
  config: Pick<Config, 'BOTS_URL' | 'BOTS_API_TOKEN'>,
  fetchFn?: typeof fetch,
): BotsClient | null {
  if (!config.BOTS_URL || !config.BOTS_API_TOKEN) return null;
  return new BotsClient({ url: config.BOTS_URL, token: config.BOTS_API_TOKEN }, fetchFn);
}
