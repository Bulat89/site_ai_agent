import { afterEach, describe, expect, it } from 'vitest';
import { signIn, startApp, type TestApp } from './helpers.js';

let t: TestApp;
afterEach(async () => {
  await t?.app.close();
});

const ids = (html: string) => new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
const links = (html: string, prefix: string) =>
  [...html.matchAll(new RegExp(`href="${prefix}#([^"]+)"`, 'g'))].map((m) => m[1]!);

describe('user guide', () => {
  it('is public: quick start, search and every topic, with the server address', async () => {
    t = await startApp();
    const res = await t.app.inject({ url: '/help' });
    expect(res.statusCode).toBe(200);
    const html = res.body;
    expect(html).toContain('<h1>Как пользоваться Goldfish</h1>');
    expect(html).toContain('data-guide-search');
    for (const topic of [
      'Вход и расширение',
      'Эталон объекта',
      'Агенты и права',
      'Задания агентам',
      'Согласования',
      'Управляющий и Telegram',
      'Сообщения гостей',
      'Показатели',
      'Если что-то не так',
    ])
      expect(html).toContain(`>${topic}</h2>`);
    expect(html).toContain('Агент просит разрешение — что выбрать?');
    expect(html).toContain('<code>https://agent.test</code> и токен');
    // The landing links to it too.
    expect((await t.app.inject({ url: '/' })).body).toContain('href="/help"');
  });

  it('every link into the guide and from it to the agents page lands on an existing anchor', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    const help = (await t.app.inject({ url: '/help', cookies })).body;
    const agents = (await t.app.inject({ url: '/agents', cookies })).body;
    const cabinet = (await t.app.inject({ url: '/', cookies })).body;
    const helpIds = ids(help);

    const intoGuide = [...links(agents, '/help'), ...links(cabinet, '/help')];
    expect(intoGuide.length).toBeGreaterThan(8);
    for (const id of intoGuide) expect(helpIds, `/help#${id}`).toContain(id);
    for (const id of links(help, '')) expect(helpIds, `#${id}`).toContain(id);

    const agentIds = ids(agents);
    for (const id of links(help, '/agents')) expect(agentIds, `/agents#${id}`).toContain(id);
    const cabinetIds = ids(cabinet);
    for (const id of links(help, '/')) expect(cabinetIds, `/#${id}`).toContain(id);
  });

  it('the agents page shows what is left to set up, with links to the guide', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    const html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toMatch(/Первые шаги · осталось \d из 4/);
    expect(html).toContain('href="#telegram-title">Привяжите Telegram');
  });
});
