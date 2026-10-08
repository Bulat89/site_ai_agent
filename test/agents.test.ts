import { afterEach, describe, expect, it } from 'vitest';
import { PUBLIC_URL, signIn, startApp, type TestApp } from './helpers.js';

const origin = { origin: PUBLIC_URL };

let t: TestApp;
afterEach(async () => {
  await t?.app.close();
});

describe('agents page', () => {
  it('needs a session', async () => {
    t = await startApp();
    const res = await t.app.inject('/agents');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/auth/yandex');
  });

  it("shows the owner's team, rights, approvals, numbers and the reference from Goldfish", async () => {
    t = await startApp();
    const cookies = await signIn(t);
    const cabinet = await t.app.inject({ url: '/', cookies });
    expect(cabinet.body).toContain('href="/agents"');
    const res = await t.app.inject({ url: '/agents', cookies });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    const html = res.body;
    expect(html).toContain('<h1>Дом у моря</h1>');
    // Team: agent switch, rights only up to the duty's ceiling, always-on duties have no select.
    expect(html).toContain('<h3>Каналы продаж</h3>');
    const fix = /<select data-act="level" data-duty="channels.fix"[^>]*>(.*?)<\/select>/s.exec(
      html,
    )![1]!;
    expect(fix).toContain('<option value="approval" selected>Согласование</option>');
    expect(fix).toContain('<option value="rule">Правило</option>');
    expect(fix).not.toContain('value="self"');
    expect(html).not.toContain('data-duty="manager.approvals"');
    expect(html).toContain('включится в волне 2');
    // Approvals, text escaped.
    expect(html).toContain('Исправить расхождения на площадках: 2');
    expect(html).toContain('&#60;b&#62;расхождения&#60;/b&#62;');
    expect(html).not.toContain('<b>расхождения</b>');
    // Numbers computed by Goldfish.
    expect(html).toMatch(/5\s200 ₽/u);
    expect(html).toContain('4,7');
    // Platforms connected in the reference only.
    expect(html).toContain('data-platform="ostrovok"');
    expect(html).not.toContain('data-platform="avito"');
    expect(html).toContain('Доброе утро! Сегодня заездов — 1.');
    const user = t.fakes.hotelCalls.map((c) => c.path);
    expect(user).toEqual(
      expect.arrayContaining([
        'yandex:1000001 ',
        'yandex:1000001 /approvals?status=pending',
        'yandex:1000001 /kpi',
        'yandex:1000001 /feed?limit=20',
      ]),
    );
  });

  it('when Goldfish is down the page says so', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    t.fakes.goldfishDown = true;
    const res = await t.app.inject({ url: '/agents', cookies });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Сервер агентов сейчас недоступен');
  });

  it('forwards changes for the signed-in owner only, from the site only, with Goldfish answers', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    const changes = [{ op: 'agent', agent: 'channels', enabled: false }];
    const foreign = await t.app.inject({
      method: 'POST',
      url: '/api/agents/settings',
      cookies,
      payload: { changes },
      headers: { origin: 'https://evil.test' },
    });
    expect(foreign.statusCode).toBe(403);
    const anonymous = await t.app.inject({
      method: 'POST',
      url: '/api/agents/settings',
      payload: { changes },
      headers: origin,
    });
    expect(anonymous.statusCode).toBe(401);
    const ok = await t.app.inject({
      method: 'POST',
      url: '/api/agents/settings',
      cookies,
      payload: { changes },
      headers: origin,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().warnings).toEqual([
      '«Применение цен»: никто не проверит, что новая цена дошла до площадок.',
    ]);
    expect(t.fakes.hotelCalls.at(-1)).toEqual({
      method: 'POST',
      path: 'yandex:1000001 /settings',
      body: { changes },
    });

    const approve = await t.app.inject({
      method: 'POST',
      url: '/api/agents/approvals/apr_1',
      cookies,
      payload: { decision: 'approve' },
      headers: origin,
    });
    expect(approve.json().status).toBe('approved');
    const missing = await t.app.inject({
      method: 'POST',
      url: '/api/agents/approvals/apr_9',
      cookies,
      payload: { decision: 'approve' },
      headers: origin,
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().message).toBe('согласование не найдено');

    const bad = await t.app.inject({
      method: 'PUT',
      url: '/api/agents/profile',
      cookies,
      payload: { name: '' },
      headers: origin,
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().message).toBe('name: обязательно');

    const tg = await t.app.inject({
      method: 'POST',
      url: '/api/agents/telegram',
      cookies,
      payload: {},
      headers: origin,
    });
    expect(tg.json()).toMatchObject({
      code: 'ABCD2345',
      link: 'https://t.me/gf_bot?start=ABCD2345',
    });
    const hook = await t.app.inject({
      method: 'POST',
      url: '/api/agents/hook-token',
      cookies,
      payload: {},
      headers: origin,
    });
    expect(hook.json().events).toBe('/hotel/hooks/gfh_x/events');

    t.fakes.goldfishDown = true;
    const down = await t.app.inject({
      method: 'POST',
      url: '/api/agents/settings',
      cookies,
      payload: { changes },
      headers: origin,
    });
    expect(down.statusCode).toBe(502);
  });
});
