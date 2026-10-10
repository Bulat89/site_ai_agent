import type { UserRecord } from '../store/types.js';
import { esc, header, helpLink, layout, type View } from './page.js';

/** What the Goldfish server returns about the owner's property (GET …/hotel). */
export interface HotelView {
  id: string;
  timezone: string;
  profile: Record<string, unknown> & { name?: string; systems?: Array<{ id: string }> };
  profileVersion: number;
  telegramLinked: boolean;
  hookConfigured: boolean;
  telegramBot?: boolean;
  settings: {
    wave: number;
    pause: { until: string; reason: string } | null;
    owner: { quietFrom: string; quietTo: string; urgentPerDay: number; summaryTime: string };
    limits: { reviewAutoMinStars: number; sharpChangePercent: number };
    platforms: Array<{
      id: string;
      title: string;
      category: string;
      mode: 'full' | 'read' | 'off';
    }>;
    agents: Array<{
      id: string;
      title: string;
      mission: string;
      metrics: string[];
      enabled: boolean;
      duties: Array<{
        id: string;
        title: string;
        when: string;
        does: string;
        wave: number;
        run: 'browser' | 'code';
        maxLevel: Level;
        alwaysOn: boolean;
        enabled: boolean;
        level: Level;
        reason?: string;
      }>;
    }>;
  };
}

type Level = 'self' | 'rule' | 'approval' | 'off';

export interface ApprovalView {
  id: string;
  agent: string;
  title: string;
  reason: string;
  cost: string | null;
  urgent: boolean;
  action: { kind: string; text?: string };
  createdAt: string;
}

export interface KpiView {
  units: number;
  past30: {
    occupancy: number | null;
    adr: number | null;
    revpar: number | null;
    directShare: number | null;
  };
  next30: { occupancy: number | null };
  rating: number | null;
  responseMinutes: number | null;
}

export interface FeedItem {
  kind: string;
  text: string;
  createdAt: string;
}

export interface AgentsState extends View {
  user: UserRecord;
  hotel: HotelView | null;
  approvals: ApprovalView[];
  kpi: KpiView | null;
  feed: FeedItem[];
  /** The latest draft of the reference from a card, while it is read or waits for the owner. */
  profileImport?: ProfileImportView | null;
  error: string | null;
}

/** «Эталон из карточки» (GET …/hotel/profile/import). */
export interface ProfileImportView {
  id: string;
  status: 'reading' | 'ready' | 'failed' | 'applied' | 'discarded';
  source: 'url' | 'text';
  url: string | null;
  platform: string | null;
  error: string | null;
  /** Read only in part (the reading stopped at a limit): why. Older servers do not send it. */
  partial?: string | null;
  createdAt: string;
  fields: Array<{ key: string; label: string; value: string; current: string }>;
}

const LEVEL_TITLES: Record<Level, string> = {
  self: 'Сам',
  rule: 'Правило',
  approval: 'Согласование',
  off: 'Выкл',
};
const RANK: Record<Level, number> = { off: 0, approval: 1, rule: 2, self: 3 };
const MODES = { full: 'работа', read: 'только чтение', off: 'выключена' } as const;
const FEED_KIND: Record<string, string> = {
  urgent: 'Срочно',
  summary: 'Сводка',
  approval: 'Согласование',
  reminder: 'Напоминание',
  notice: 'В сводку',
  answer: 'Ответ',
};

const attr = (v: unknown) => esc(JSON.stringify(v));
const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('ru-RU')}%`;
const rub = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `${n.toLocaleString('ru-RU')} ₽`;
const when = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function kpiTiles(k: KpiView | null): string {
  if (!k) return '';
  if (!k.units)
    return `<p class="notice">Добавьте в эталон категории номеров и их количество — тогда управляющий посчитает загрузку, ADR и RevPAR.</p>`;
  const tiles: Array<[string, string]> = [
    ['Загрузка на 30 дней вперёд', pct(k.next30.occupancy)],
    ['Загрузка за 30 дней', pct(k.past30.occupancy)],
    ['ADR за 30 дней', rub(k.past30.adr)],
    ['RevPAR за 30 дней', rub(k.past30.revpar)],
    ['Доля прямых броней', pct(k.past30.directShare)],
    ['Рейтинг', k.rating === null ? '—' : String(k.rating).replace('.', ',')],
    ['Первый ответ гостю', k.responseMinutes === null ? '—' : `${k.responseMinutes} мин`],
  ];
  return `<div class="tiles">${tiles
    .map(
      ([t, v]) =>
        `<div class="tile"><span class="tile__label">${esc(t)}</span><b>${esc(v)}</b></div>`,
    )
    .join('')}</div>`;
}

/**
 * «Первые шаги»: what is left before the agents can work, each with a link to the place to do
 * it and to the guide. Hidden once everything is done.
 */
function firstSteps(h: HotelView): string {
  const rooms = (h.profile.rooms as unknown[] | undefined) ?? [];
  const steps: Array<{ done: boolean; title: string; href: string; help: string }> = [
    {
      done: !!h.profile.name && rooms.length > 0,
      title: 'Заполните эталон: название и номера — можно по ссылке на карточку',
      href: '#profile-title',
      help: 'profile-card',
    },
    {
      done: (h.profile.systems ?? []).length > 0,
      title: 'Добавьте в эталон PMS и площадки',
      href: '#profile-title',
      help: 'systems',
    },
    {
      done: h.settings.agents.some((a) => a.enabled),
      title: 'Включите агентов — начните с «Каналов продаж»',
      href: '#team-title',
      help: 'agent-on',
    },
    {
      done: h.telegramLinked,
      title: 'Привяжите Telegram для сводки и согласований',
      href: '#telegram-title',
      help: 'tg-link',
    },
  ];
  const left = steps.filter((x) => !x.done).length;
  if (!left) return '';
  return `<section class="card steps-card" aria-labelledby="first-title">
    <div class="card__head"><h2 id="first-title">Первые шаги · осталось ${left} из ${steps.length}</h2>${helpLink('topic-start', 'Вся инструкция')}</div>
    <ol class="checklist">
${steps
  .map(
    (x) =>
      `      <li class="${x.done ? 'checklist__done' : ''}"><span class="checklist__mark" aria-hidden="true">${x.done ? '✓' : ''}</span><span>${x.done ? `${esc(x.title)}<span class="visually-hidden"> — готово</span>` : `<a href="${x.href}">${esc(x.title)}</a> ${helpLink(x.help, 'как?')}`}</span></li>`,
  )
  .join('\n')}
    </ol>
  </section>`;
}

function approvalsBlock(list: ApprovalView[], agents: Map<string, string>): string {
  if (!list.length) return `<p class="hint">Ничего не ждёт вашего решения.</p>`;
  return list
    .map(
      (a) => `<article class="approval${a.urgent ? ' approval--urgent' : ''}">
  <p class="approval__agent">${esc(agents.get(a.agent) ?? a.agent)}${a.urgent ? ' · срочно' : ''} · ${esc(when(a.createdAt))}</p>
  <h3>${esc(a.title)}</h3>
  <p class="approval__reason">${esc(a.reason)}</p>
  ${a.cost ? `<p class="approval__reason">Сколько стоит: ${esc(a.cost)}</p>` : ''}
  ${a.action.text ? `<pre class="approval__text">${esc(a.action.text)}</pre>` : ''}
  <div class="row">
    <button class="btn btn--accent btn--sm" type="button" data-act="approve" data-id="${esc(a.id)}">Согласовать</button>
    <button class="btn btn--ghost btn--sm" type="button" data-act="reject" data-id="${esc(a.id)}">Отклонить</button>
    ${a.action.kind === 'none' ? '' : `<button class="btn btn--ghost btn--sm" type="button" data-act="edit-open" data-id="${esc(a.id)}">Изменить</button>`}
  </div>
  ${
    a.action.kind === 'none'
      ? ''
      : `<form class="edit" data-form="edit" data-id="${esc(a.id)}" hidden>
    <textarea name="text" rows="4" aria-label="Новый текст">${esc(a.action.text ?? '')}</textarea>
    <button class="btn btn--accent btn--sm" type="submit">Изменить и согласовать</button>
  </form>`
  }
</article>`,
    )
    .join('');
}

function levelSelect(d: HotelView['settings']['agents'][number]['duties'][number]): string {
  if (d.alwaysOn) return `<span class="muted">всегда</span>`;
  const options = (['self', 'rule', 'approval', 'off'] as Level[]).filter(
    (l) => RANK[l] <= RANK[d.maxLevel],
  );
  const current = d.enabled ? d.level : 'off';
  return `<select data-act="level" data-duty="${esc(d.id)}" aria-label="Права «${esc(d.title)}»">${options
    .map(
      (l) => `<option value="${l}"${l === current ? ' selected' : ''}>${LEVEL_TITLES[l]}</option>`,
    )
    .join('')}</select>`;
}

/**
 * «Выполнить» gives the duty to its agent now. A duty that is off is not run: the server answers
 * with a request for permission, and the page shows it (see the permission dialog).
 */
function runButton(d: HotelView['settings']['agents'][number]['duties'][number]): string {
  if (d.alwaysOn) return '';
  return `<br><button class="btn btn--ghost btn--xs duty__run" type="button" data-act="run" data-duty="${esc(d.id)}" data-title="${esc(d.title)}">Выполнить</button>`;
}

/** The agent asks the owner before running a duty that is off; without an answer nothing runs. */
function permissionDialog(): string {
  return `<dialog class="permission" data-permission aria-labelledby="permission-title">
  <h2 id="permission-title">Нужно ваше разрешение</h2>
  <p class="permission__text" data-permission-text></p>
  <div class="row">
    <button class="btn btn--accent btn--sm" type="button" data-grant="once">Разрешить один раз</button>
    <button class="btn btn--ghost btn--sm" type="button" data-grant="always">Разрешить всегда</button>
    <button class="btn btn--ghost btn--sm" type="button" data-grant="no">Не выполнять</button>
  </div>
</dialog>`;
}

/**
 * An agent: title, mission, state and the switch are always visible; duties with their rights are
 * folded by default (the page remembers which cards the owner opened, see app.js).
 */
function agentCard(a: HotelView['settings']['agents'][number], wave: number): string {
  const working = a.duties.filter((d) => d.enabled).length;
  const state = a.enabled
    ? `<span class="agent__state agent__state--on">работает · ${working} из ${a.duties.length} обязанностей</span>`
    : `<span class="agent__state">выключен</span>`;
  return `<article class="agent${a.enabled ? ' agent--on' : ''}">
  <header class="agent__head">
    <div>
      <h3>${esc(a.title)}</h3>
      <p class="hint">${esc(a.mission)}</p>
      ${state}
    </div>
    <button class="btn btn--sm ${a.enabled ? 'btn--ghost' : 'btn--accent'}" type="button" data-act="settings" data-changes="${attr([{ op: 'agent', agent: a.id, enabled: !a.enabled }])}">${a.enabled ? 'Выключить' : 'Включить'}</button>
  </header>
  <details class="agent__more" data-fold="agent:${esc(a.id)}">
  <summary>Обязанности и права · ${a.duties.length}</summary>
  <p class="agent__metrics">Показатели: ${esc(a.metrics.join(', '))}</p>
  <table class="duties">
    <thead><tr><th>Обязанность</th><th>Когда</th><th>Права</th></tr></thead>
    <tbody>
${a.duties
  .map(
    (d) => `      <tr class="${d.enabled ? '' : 'duty--off'}">
        <td><span title="${esc(d.does)}">${esc(d.title)}</span>${d.wave > wave ? ` <span class="badge">волна ${d.wave}</span>` : ''}${!d.enabled && d.reason ? `<br><span class="muted">${esc(d.reason)}</span>` : ''}${runButton(d)}</td>
        <td>${esc(d.when)}</td>
        <td>${levelSelect(d)}</td>
      </tr>`,
  )
  .join('\n')}
    </tbody>
  </table>
  </details>
</article>`;
}

function platformsBlock(h: HotelView): string {
  const connected = new Set((h.profile.systems ?? []).map((s) => s.id));
  const list = h.settings.platforms.filter((p) => connected.has(p.id));
  if (!list.length)
    return `<p class="hint">Площадки и системы появятся здесь, когда вы добавите их в эталон объекта (раздел «Системы»).</p>`;
  return `<table class="duties">
  <tbody>
${list
  .map(
    (p) =>
      `    <tr><td>${esc(p.title)}</td><td><select data-act="platform" data-platform="${esc(p.id)}" aria-label="${esc(p.title)}">${(
        Object.keys(MODES) as Array<keyof typeof MODES>
      )
        .map((m) => `<option value="${m}"${m === p.mode ? ' selected' : ''}>${MODES[m]}</option>`)
        .join('')}</select></td></tr>`,
  )
  .join('\n')}
  </tbody>
</table>`;
}

const PROFILE_LISTS: Array<{ key: string; title: string; example: string }> = [
  {
    key: 'rooms',
    title: 'Номера',
    example: '[{"id":"std","name":"Стандарт","count":4,"capacity":2,"basePrice":5000}]',
  },
  {
    key: 'faq',
    title: 'Ответы на частые вопросы',
    example: '[{"topic":"parking","answer":"Парковка во дворе, бесплатно."}]',
  },
  {
    key: 'systems',
    title: 'Системы и площадки',
    example:
      '[{"id":"bnovo","url":"https://online.bnovo.ru/"},{"id":"ostrovok","url":"https://extranet.ostrovok.ru/","messagesUrl":"https://extranet.ostrovok.ru/messages","commissionPercent":15}]',
  },
  {
    key: 'competitors',
    title: 'Конкуренты (5–10)',
    example: '[{"name":"Вилла у моря","url":"https://ostrovok.ru/hotel/..."}]',
  },
  { key: 'upsells', title: 'Допродажи', example: '[{"name":"Ранний заезд","price":1000}]' },
];

/**
 * «Заполнить из карточки»: a link to the property's card on any aggregator, or its text. While
 * the agent reads it, the page waits (app.js polls); a ready draft shows the found fields next
 * to the current ones, each with a checkbox. Nothing changes until the owner applies.
 */
function importBlock(imp: ProfileImportView | null | undefined): string {
  const where = imp?.platform ? ` на ${esc(imp.platform)}` : '';
  if (imp?.status === 'reading')
    return `<div class="import import--wait" data-import-poll="${esc(imp.id)}" role="status">
  <span class="spinner" aria-hidden="true"></span>
  <div>
    <b>Агент читает карточку${where}…</b>
    <p class="hint">Обычно 1–3 минуты. Браузер с расширением Goldfish должен быть открыт. Страница обновится сама.</p>
  </div>
</div>`;
  if (imp?.status === 'ready')
    return `<form class="import import--ready" data-form="import-apply" data-id="${esc(imp.id)}">
  <h3>Черновик из карточки${where}: найдено ${imp.fields.length}</h3>
${imp.partial ? `  <p class="hint warn">Карточка прочитана не полностью (${esc(imp.partial)}) — части полей может не быть. Примените найденное и пришлите карточку ещё раз или вставьте её текст.</p>\n` : ''}  <p class="hint">Отметьте, что перенести в эталон. Списки дополняются, а не заменяются; у новых номеров количество — 1, проверьте его потом в поле «Номера».</p>
  <div class="table-scroll"><table class="duties import__table">
    <thead><tr><th><span class="visually-hidden">Перенести</span></th><th>Поле</th><th>Из карточки</th><th>Сейчас в эталоне</th></tr></thead>
    <tbody>
${imp.fields
  .map(
    (f) =>
      `      <tr><td><input type="checkbox" name="field" value="${esc(f.key)}" checked aria-label="Перенести «${esc(f.label)}»"></td><td>${esc(f.label)}</td><td>${esc(f.value)}</td><td class="muted">${f.current ? esc(f.current) : '—'}</td></tr>`,
  )
  .join('\n')}
    </tbody>
  </table></div>
  <div class="row">
    <button class="btn btn--accent btn--sm" type="submit">Применить выбранное</button>
    <button class="btn btn--ghost btn--sm" type="button" data-act="import-discard" data-id="${esc(imp.id)}">Не применять</button>
  </div>
</form>`;
  return `<div class="import">
  <h3>Заполнить из карточки</h3>
  <p class="hint">Пришлите ссылку на карточку вашего объекта на Авито, Яндекс Путешествиях, Островке или другом агрегаторе — агент прочитает её и предложит, что перенести в эталон. Без вашего «применить» ничего не изменится.</p>
  <form class="field__row" data-form="import-url">
    <input name="url" type="url" required placeholder="https://www.avito.ru/…" aria-label="Ссылка на карточку объекта">
    <button class="btn btn--accent btn--sm" type="submit">Заполнить</button>
  </form>
  <details class="import__text">
    <summary>Нет ссылки или карточка не открывается? Вставьте её текст</summary>
    <form data-form="import-text">
      <textarea name="text" rows="5" required aria-label="Текст карточки" placeholder="Скопируйте со страницы карточки описание, номера с ценами, удобства и правила"></textarea>
      <button class="btn btn--ghost btn--sm" type="submit">Разобрать текст</button>
    </form>
  </details>
  <p class="error" data-import-error role="alert" hidden></p>
</div>`;
}

function profileForm(h: HotelView): string {
  const p = h.profile as Record<string, unknown>;
  const policies = (p.policies ?? {}) as Record<string, string>;
  const corridor = (p.priceCorridor ?? { percent: 10 }) as { percent: number };
  const text = (name: string, label: string, value: unknown, type = 'text') =>
    `<label class="field"><span class="field__label">${esc(label)}</span><input name="${esc(name)}" type="${type}" value="${esc(String(value ?? ''))}"></label>`;
  return `<form class="profile" data-form="profile">
  <div class="grid2">
    ${text('name', 'Название', p.name)}
    ${text('address', 'Адрес', p.address)}
    ${text('phone', 'Телефон', p.phone)}
    ${text('website', 'Сайт', p.website ?? '', 'url')}
    ${text('checkIn', 'Заезд с', p.checkIn, 'time')}
    ${text('checkOut', 'Выезд до', p.checkOut, 'time')}
    ${text('corridor', 'Коридор цены, ± % от базовой', corridor.percent, 'number')}
    ${text('adsMonthlyBudget', 'Бюджет рекламы в месяц, ₽', p.adsMonthlyBudget ?? '', 'number')}
  </div>
  <div class="grid2">
    ${text('policies.children', 'Дети', policies.children)}
    ${text('policies.pets', 'Животные', policies.pets)}
    ${text('policies.prepayment', 'Предоплата', policies.prepayment)}
    ${text('policies.cancellation', 'Отмена', policies.cancellation)}
  </div>
  <label class="field"><span class="field__label">Как добраться</span><textarea name="directions" rows="2">${esc(String(p.directions ?? ''))}</textarea></label>
  <label class="field"><span class="field__label">Удобства (через запятую)</span><input name="amenities" value="${esc(((p.amenities as string[]) ?? []).join(', '))}"></label>
${PROFILE_LISTS.map(
  (l) =>
    `  <label class="field"><span class="field__label">${esc(l.title)} (JSON)</span><textarea class="code" name="${l.key}" rows="4" placeholder="${esc(l.example)}">${esc(JSON.stringify(p[l.key] ?? [], null, 1))}</textarea></label>`,
).join('\n')}
  <input type="hidden" name="base" value="${attr(p)}">
  <p class="error" data-error hidden></p>
  <button class="btn btn--accent" type="submit">Сохранить эталон</button>
  <p class="hint">Версия эталона: ${h.profileVersion}. Изменения сразу уходят агентам: «Каналы продаж» подготовят один пакет правок для всех площадок на согласование.</p>
</form>`;
}

function ownerForm(h: HotelView): string {
  const o = h.settings.owner;
  return `<form class="grid2" data-form="owner">
  <label class="field"><span class="field__label">Сводка в</span><input name="summaryTime" type="time" value="${esc(o.summaryTime)}"></label>
  <label class="field"><span class="field__label">Срочных в день, не больше</span><input name="urgentPerDay" type="number" min="0" max="50" value="${o.urgentPerDay}"></label>
  <label class="field"><span class="field__label">Тихие часы с</span><input name="quietFrom" type="time" value="${esc(o.quietFrom)}"></label>
  <label class="field"><span class="field__label">до</span><input name="quietTo" type="time" value="${esc(o.quietTo)}"></label>
  <label class="field"><span class="field__label">Отвечать на отзывы сам — от звёзд</span><input name="reviewAutoMinStars" type="number" min="1" max="6" value="${h.settings.limits.reviewAutoMinStars}"></label>
  <div class="field"><button class="btn btn--ghost btn--sm" type="submit">Сохранить</button></div>
</form>`;
}

function telegramBlock(h: HotelView): string {
  if (h.telegramBot === false)
    return `<p class="hint">Telegram-бот ещё не настроен на сервере. Пока сообщения управляющего — в ленте ниже.</p>`;
  return `<p>${h.telegramLinked ? 'Telegram привязан: сводки, срочное и согласования приходят туда.' : 'Привяжите Telegram — управляющий будет присылать сводку, срочное и кнопки согласований.'}</p>
<button class="btn ${h.telegramLinked ? 'btn--ghost' : 'btn--accent'} btn--sm" type="button" data-act="telegram">${h.telegramLinked ? 'Привязать другой чат' : 'Привязать Telegram'}</button>
<p class="hint" data-telegram hidden></p>`;
}

function hookBlock(goldfishUrl: string): string {
  return `<p class="hint">Для писем-уведомлений площадок, вебхуков PMS и своего мессенджера: адреса с токеном объекта. Новый токен отзывает старый.</p>
<button class="btn btn--ghost btn--sm" type="button" data-act="hook-token" data-base="${esc(goldfishUrl)}">Выпустить токен вебхуков</button>
<div class="field" data-hook hidden>
  <span class="field__label">События (PMS, мессенджер)</span>
  <span class="field__row"><input readonly data-hook-events aria-label="Адрес событий"><button class="btn btn--ghost btn--sm" type="button" data-copy-from-attr="data-hook-events">Копировать</button></span>
  <span class="field__label">Пересылка писем</span>
  <span class="field__row"><input readonly data-hook-email aria-label="Адрес писем"><button class="btn btn--ghost btn--sm" type="button" data-copy-from-attr="data-hook-email">Копировать</button></span>
</div>`;
}

function feedBlock(feed: FeedItem[]): string {
  if (!feed.length) return `<p class="hint">Сообщений пока нет.</p>`;
  return `<ul class="feed">${feed
    .map(
      (f) =>
        `<li><span class="feed__meta">${esc(FEED_KIND[f.kind] ?? f.kind)} · ${esc(when(f.createdAt))}</span><pre>${esc(f.text)}</pre></li>`,
    )
    .join('')}</ul>`;
}

/** The owner's agents: team and rights, approvals, numbers, Telegram, the property reference. */
export function renderAgents(s: AgentsState): string {
  const h = s.hotel;
  if (!h) {
    return layout(
      s,
      'Агенты — Goldfish',
      `${header(s.user)}
<main class="wrap empty">
  <h1>Агенты объекта</h1>
  <p class="notice" role="status">${esc(s.error ?? 'Сервер агентов сейчас недоступен — попробуйте через минуту.')}</p>
  <p class="lead"><a href="/">В кабинет</a></p>
</main>`,
    );
  }
  const agents = new Map(h.settings.agents.map((a) => [a.id, a.title]));
  const set = h.settings;
  const name = String(h.profile.name ?? '');
  return layout(
    s,
    'Агенты — Goldfish',
    `${header(s.user)}
<main class="wrap agents">
  <section class="hero hero--user">
    <div class="hero__text">
      <p class="eyebrow"><a href="/">Кабинет</a> · агенты объекта</p>
      <h1>${name ? esc(name) : 'Ваш объект'}</h1>
      <p class="lead">Управляющий и пять агентов. Права у каждой обязанности — «Сам», «Правило» или «Согласование»; выключить можно агента, обязанность, площадку или поставить паузу. Выключенную обязанность агент выполнит только с вашего разрешения.</p>
    </div>
  </section>
  ${s.error ? `<p class="notice" role="status">${esc(s.error)}</p>` : ''}
  <p class="error" data-page-error role="alert" hidden></p>
  <p class="notice" data-page-status role="status" hidden></p>
  ${firstSteps(h)}
  ${kpiTiles(s.kpi)}
  <section class="card" aria-labelledby="approvals-title">
    <div class="card__head"><h2 id="approvals-title">Ждут решения${s.approvals.length ? ` · ${s.approvals.length}` : ''}</h2>${helpLink('decide', 'Как решать?')}</div>
    ${approvalsBlock(s.approvals, agents)}
  </section>
  <section class="card" aria-labelledby="launch-title">
    <div class="card__head"><h2 id="launch-title">Запуск</h2>${helpLink('waves', 'Что такое волны?')}</div>
    <div class="row">
      <label class="field"><span class="field__label">Волна</span><select data-act="wave" aria-label="Волна">${[
        1, 2, 3,
      ]
        .map(
          (w) =>
            `<option value="${w}"${w === set.wave ? ' selected' : ''}>${w} — ${['видеть всё и не терять брони', 'отвечать и советовать', 'действовать по правилам'][w - 1]}</option>`,
        )
        .join('')}</select></label>
    </div>
    <form class="row" data-form="pause">
      <label class="field"><span class="field__label">Пауза до</span><input name="until" type="date" value="${esc(set.pause?.until ?? '')}"></label>
      <label class="field"><span class="field__label">Причина</span><input name="reason" value="${esc(set.pause?.reason ?? '')}" placeholder="ремонт, сезон закрыт"></label>
      <div class="field"><button class="btn btn--ghost btn--sm" type="submit">Поставить паузу</button>${set.pause ? ` <button class="btn btn--ghost btn--sm" type="button" data-act="settings" data-changes="${attr([{ op: 'pause', until: null }])}">Снять паузу</button>` : ''}</div>
    </form>
    <p class="hint">На паузе записи на площадках и сообщения ждут, чтение и сводка идут.</p>
  </section>
  <section aria-labelledby="team-title">
    <div class="card__head"><h2 id="team-title" class="section-title">Команда</h2><span class="row row--tight"><button class="link" type="button" data-fold-all="agent:">Развернуть всё</button>${helpLink('levels', 'Что значат права?')}</span></div>
    <p class="hint">«Выполнить» — дать задание сейчас. Если обязанность выключена, агент спросит разрешение. ${helpLink('permission', 'Подробнее')}</p>
    <div class="agents__grid">
${set.agents.map((a) => agentCard(a, set.wave)).join('\n')}
    </div>
  </section>
  <section class="cabinet">
    <article class="card">
      <div class="card__head"><h2 id="platforms-title">Площадки</h2>${helpLink('platforms', 'Режимы')}</div>
      ${platformsBlock(h)}
    </article>
    <article class="card">
      <div class="card__head"><h2 id="telegram-title">Управляющий и Telegram</h2>${helpLink('tg-commands', 'Команды')}</div>
      ${telegramBlock(h)}
      ${ownerForm(h)}
    </article>
  </section>
  <section class="card" aria-labelledby="profile-title">
    <div class="card__head"><h2 id="profile-title">Эталон объекта</h2>${helpLink('profile-card', 'Как заполнить?')}</div>
    <p class="hint">Единый источник правды для всех агентов: по нему сверяются карточки и сайт, из него собираются ответы гостям.</p>
    ${importBlock(s.profileImport)}
    <details class="profile__manual"${s.profileImport?.status === 'ready' ? '' : ' open'}>
      <summary>Заполнить вручную</summary>
      ${profileForm(h)}
    </details>
  </section>
  <section class="cabinet">
    <article class="card">
      <h2 id="feed-title">Сообщения управляющего</h2>
      ${feedBlock(s.feed)}
    </article>
    <article class="card">
      <div class="card__head"><h2 id="hooks-title">Вебхуки объекта</h2>${helpLink('mail', 'Зачем они?')}</div>
      ${hookBlock(s.goldfishUrl)}
    </article>
  </section>
  ${permissionDialog()}
</main>`,
  );
}
