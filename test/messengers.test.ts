import { afterEach, describe, expect, it } from 'vitest';
import {
  BOTS_TOKEN,
  BOTS_URL,
  PUBLIC_URL,
  signIn,
  startApp,
  testConfig,
  type TestApp,
} from './helpers.js';

const origin = { origin: PUBLIC_URL };
const BOTS = { BOTS_URL, BOTS_API_TOKEN: BOTS_TOKEN };

let t: TestApp;
afterEach(async () => {
  await t?.app.close();
});

describe('the manager in messengers', () => {
  it('BOTS_URL and BOTS_API_TOKEN come together', () => {
    expect(testConfig(BOTS).BOTS_URL).toBe(BOTS_URL);
    expect(() => testConfig({ BOTS_URL })).toThrow(/set together/);
    expect(() => testConfig({ ...BOTS, BOTS_API_TOKEN: 'short' })).toThrow(/32–256/);
  });

  it('without the bots the Goldfish Telegram bot is linked as before', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    const html = (await t.app.inject({ url: '/agents?tab=settings', cookies })).body;
    expect(html).toContain('Управляющий и Telegram');
    expect(html).toContain('data-act="telegram"');
    expect(html).not.toContain('data-messengers');
    const codes = await t.app.inject({
      method: 'POST',
      url: '/api/agents/messengers/codes',
      cookies,
      headers: origin,
    });
    expect(codes.statusCode).toBe(404);
  });

  it('QR codes for each messenger, the linked chats and unlinking', async () => {
    t = await startApp(BOTS);
    const cookies = await signIn(t);
    let html = (await t.app.inject({ url: '/agents?tab=settings', cookies })).body;
    expect(html).toContain('Управляющий в мессенджерах');
    expect(html).toContain('<b>Мессенджер не привязан.</b>');
    expect(html).toContain('Доступны: Telegram, MAX, WhatsApp.');
    expect(html).toContain('data-act="messenger-codes">Показать QR-коды</button>');
    // The state line and «Первые шаги» speak of messengers, not of Telegram alone.
    expect(html).toContain('>Мессенджер не привязан</a>');
    expect(html).toContain('Привяжите мессенджер — Telegram, MAX или WhatsApp');

    const codes = await t.app.inject({
      method: 'POST',
      url: '/api/agents/messengers/codes',
      cookies,
      headers: origin,
    });
    expect(codes.statusCode).toBe(200);
    const body = codes.json();
    expect(body.offers.map((o: { channel: string }) => o.channel)).toEqual([
      'telegram',
      'whatsapp',
    ]);
    expect(body.offers[0].url).toBe('https://t.me/goldfish_bot?start=K7Q2M9XZ');
    expect(body.offers[0].qr).toMatch(/^data:image\/png;base64,/);
    expect(t.fakes.botsCalls.at(-1)).toMatch(
      /^POST \/api\/owners\/cl_\d+\/yandex%3A1000001\/codes$/,
    );
    // Only from the site's own pages.
    const foreign = await t.app.inject({
      method: 'POST',
      url: '/api/agents/messengers/codes',
      cookies,
      headers: { origin: 'https://evil.test' },
    });
    expect(foreign.statusCode).toBe(403);

    t.fakes.messengerLinks = [
      {
        channel: 'telegram',
        title: 'Telegram',
        chatId: '42',
        name: 'Иван <script>',
        linkedAt: '2026-10-16T20:00:00.000Z',
      },
    ];
    const polled = await t.app.inject({ url: '/api/agents/messengers', cookies });
    expect(polled.json().links).toHaveLength(1);
    html = (await t.app.inject({ url: '/agents?tab=settings', cookies })).body;
    expect(html).toContain('<b>Управляющий пишет в мессенджер</b>');
    expect(html).toContain('Иван &#60;script&#62;');
    expect(html).toContain('>Мессенджеры: Telegram</a>');
    expect(html).not.toContain('Привяжите мессенджер');
    expect(html).toContain(
      'data-act="messenger-unlink" data-channel="telegram" data-chat="42" data-title="Telegram">Отвязать</button>',
    );

    const unlink = await t.app.inject({
      method: 'POST',
      url: '/api/agents/messengers/unlink',
      cookies,
      payload: { channel: 'telegram', chatId: '42' },
      headers: origin,
    });
    expect(unlink.json()).toEqual({ unlinked: true });
    expect(t.fakes.messengerLinks).toEqual([]);
  });

  it('the bots being down does not stop the page', async () => {
    t = await startApp(BOTS);
    t.fakes.botsDown = true;
    const cookies = await signIn(t);
    const res = await t.app.inject({ url: '/agents?tab=settings', cookies });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Сервер ботов сейчас не отвечает');
    expect(res.body).toContain('Исправить расхождения на площадках: 2');
    const codes = await t.app.inject({
      method: 'POST',
      url: '/api/agents/messengers/codes',
      cookies,
      headers: origin,
    });
    expect(codes.statusCode).toBe(502);
    expect(codes.json().message).toMatch(/Сервер ботов/);
  });
});
