import { afterEach, describe, expect, it } from 'vitest';
import {
  COMPETITORS_READY,
  IMPORT_READY,
  LISTINGS_READY,
  PUBLIC_URL,
  signIn,
  startApp,
  type TestApp,
} from './helpers.js';

const origin = { origin: PUBLIC_URL };

let t: TestApp;
afterEach(async () => {
  await t?.app.close();
});

describe('agents page: folded team and the reference from a card', () => {
  it('duties of every agent are folded by default; the state of the agent stays visible', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    const html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toContain('<details class="agent__more" data-fold="agent:channels">');
    expect(html).not.toMatch(/class="agent__more"[^>]*\sopen/);
    expect(html).toMatch(/работает · \d+ из \d+ обязанностей/);
    expect(html).toContain('data-fold-all="agent:"');
    // The landing folds what each agent does as well.
    const landing = (await t.app.inject({ url: '/' })).body;
    expect(landing).toContain('<details class="feature__more">');
    expect(landing).not.toMatch(/class="feature__more"[^>]*\sopen/);
  });

  it('offers a link or the text of a card; a ready draft lists fields with checkboxes', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    let html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toContain('Заполнить из карточки');
    expect(html).toContain('data-form="import-url"');
    expect(html).toContain('data-form="import-text"');
    expect(html).toContain('<details class="profile__manual" open>');

    t.fakes.profileImport = { ...IMPORT_READY, status: 'reading', fields: [] };
    html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toContain('data-import-poll="imp_1"');
    expect(html).toContain('Агент читает карточку на Авито');

    t.fakes.profileImport = IMPORT_READY;
    html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toContain('Черновик из карточки на Авито: найдено 2');
    expect(html).toContain('<input type="checkbox" name="field" value="rooms" checked');
    expect(html).toContain('Дом у моря &#60;b&#62;');
    expect(html).not.toContain('Дом у моря <b>');
    expect(html).toContain('<details class="profile__manual">');
    expect(html).not.toContain('прочитана не полностью');

    // The reading stopped at a limit: the draft of what was read says so.
    t.fakes.profileImport = { ...IMPORT_READY, partial: 'достигнут лимит шагов (60)' };
    html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toContain(
      'Карточка прочитана не полностью (достигнут лимит шагов (60)) — части полей может не быть.',
    );
  });

  it('forwards the import calls for the signed-in owner; the poll needs only the session', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    const start = await t.app.inject({
      method: 'POST',
      url: '/api/agents/profile/import',
      cookies,
      payload: { url: 'https://www.avito.ru/sochi/doma/dom_1' },
      headers: origin,
    });
    expect(start.statusCode).toBe(201);
    expect(t.fakes.hotelCalls.at(-1)).toEqual({
      method: 'POST',
      path: 'yandex:1000001 /profile/import',
      body: { url: 'https://www.avito.ru/sochi/doma/dom_1' },
    });
    const empty = await t.app.inject({
      method: 'POST',
      url: '/api/agents/profile/import',
      cookies,
      payload: {},
      headers: origin,
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().message).toBe('пришлите ссылку на карточку или её текст');

    const poll = await t.app.inject({ url: '/api/agents/profile/import/imp_1', cookies });
    expect(poll.json().status).toBe('ready');
    expect((await t.app.inject({ url: '/api/agents/profile/import/imp_1' })).statusCode).toBe(401);

    const apply = await t.app.inject({
      method: 'POST',
      url: '/api/agents/profile/import/imp_1/apply',
      cookies,
      payload: { fields: ['name'] },
      headers: origin,
    });
    expect(apply.json().applied).toEqual(['Название']);
    const foreign = await t.app.inject({
      method: 'POST',
      url: '/api/agents/profile/import/imp_1/discard',
      cookies,
      payload: {},
      headers: { origin: 'https://evil.test' },
    });
    expect(foreign.statusCode).toBe(403);
  });
});

describe('agents page: listings on the platforms and competitors', () => {
  it('offers both searches, then shows the listings with «моё» and the candidates with answers', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    let html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toContain('data-act="listings-start"');
    expect(html).toContain('data-act="competitors-start"');
    expect(html).toContain('Поиск начнётся только по кнопке');

    t.fakes.listings = { ...LISTINGS_READY, status: 'searching' };
    t.fakes.competitorSearch = { ...COMPETITORS_READY, status: 'searching' };
    html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toContain('data-poll-url="/api/agents/listings"');
    expect(html).toContain('data-poll-url="/api/agents/competitors"');

    t.fakes.listings = LISTINGS_READY;
    t.fakes.competitorSearch = COMPETITORS_READY;
    html = (await t.app.inject({ url: '/agents', cookies })).body;
    expect(html).toContain(
      'data-act="listing-verdict" data-id="lst_1" data-platform="ostrovok" data-mine="1"',
    );
    expect(html).toContain('похоже на ваше: название совпадает, адрес совпадает');
    expect(html).toContain('✓ подключена');
    expect(html).toContain('data-act="listing-publish" data-id="lst_1" data-platform="avito"');
    expect(html).toContain('не прочитано: капча');
    expect(html).toContain('data-act="listings-sync"');
    expect(html).toContain(
      '<a href="https://ostrovok.ru/hotel/villa" target="_blank" rel="noopener">Вилла Роза</a>',
    );
    // A link that is not http(s) is shown as text; names are escaped.
    expect(html).not.toContain('javascript:alert');
    expect(html).toContain('Гранд &#60;Отель&#62;');
    expect(html).toContain('data-verdict="not" aria-pressed="true"');
  });

  it('forwards the owner’s answers and polls only with the session', async () => {
    t = await startApp();
    const cookies = await signIn(t);
    const mine = await t.app.inject({
      method: 'POST',
      url: '/api/agents/listings/lst_1/ostrovok',
      cookies,
      headers: origin,
      payload: { mine: true },
    });
    expect(mine.json()).toMatchObject({ id: 'lst_1', mine: true });
    const verdict = await t.app.inject({
      method: 'POST',
      url: '/api/agents/competitors/candidates/cmp_1',
      cookies,
      headers: origin,
      payload: { verdict: 'direct' },
    });
    expect(verdict.json()).toMatchObject({
      verdict: 'direct',
      competitors: [{ name: 'Вилла Роза' }],
    });
    // Changes need this site's origin; a poll needs only the session.
    expect(
      (await t.app.inject({ method: 'POST', url: '/api/agents/listings', cookies })).statusCode,
    ).toBe(403);
    t.fakes.listings = LISTINGS_READY;
    expect((await t.app.inject({ url: '/api/agents/listings', cookies })).json()).toMatchObject({
      status: 'ready',
    });
    expect((await t.app.inject({ url: '/api/agents/listings' })).statusCode).toBe(401);
  });
});
