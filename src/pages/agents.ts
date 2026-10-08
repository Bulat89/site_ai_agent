import type { UserRecord } from '../store/types.js';
import { esc, header, layout, type View } from './page.js';

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
  error: string | null;
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

function agentCard(a: HotelView['settings']['agents'][number], wave: number): string {
  return `<article class="agent${a.enabled ? ' agent--on' : ''}">
  <header class="agent__head">
    <div>
      <h3>${esc(a.title)}</h3>
      <p class="hint">${esc(a.mission)}</p>
    </div>
    <button class="btn btn--sm ${a.enabled ? 'btn--ghost' : 'btn--accent'}" type="button" data-act="settings" data-changes="${attr([{ op: 'agent', agent: a.id, enabled: !a.enabled }])}">${a.enabled ? 'Выключить' : 'Включить'}</button>
  </header>
  <p class="agent__metrics">Показатели: ${esc(a.metrics.join(', '))}</p>
  <table class="duties">
    <thead><tr><th>Обязанность</th><th>Когда</th><th>Права</th></tr></thead>
    <tbody>
${a.duties
  .map(
    (d) => `      <tr class="${d.enabled ? '' : 'duty--off'}">
        <td><span title="${esc(d.does)}">${esc(d.title)}</span>${d.wave > wave ? ` <span class="badge">волна ${d.wave}</span>` : ''}${!d.enabled && d.reason ? `<br><span class="muted">${esc(d.reason)}</span>` : ''}</td>
        <td>${esc(d.when)}</td>
        <td>${levelSelect(d)}</td>
      </tr>`,
  )
  .join('\n')}
    </tbody>
  </table>
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
      <p class="lead">Управляющий и пять агентов. Права у каждой обязанности — «Сам», «Правило» или «Согласование»; выключить можно агента, обязанность, площадку или поставить паузу.</p>
    </div>
  </section>
  ${s.error ? `<p class="notice" role="status">${esc(s.error)}</p>` : ''}
  <p class="error" data-page-error role="alert" hidden></p>
  ${kpiTiles(s.kpi)}
  <section class="card" aria-labelledby="approvals-title">
    <h2 id="approvals-title">Ждут решения${s.approvals.length ? ` · ${s.approvals.length}` : ''}</h2>
    ${approvalsBlock(s.approvals, agents)}
  </section>
  <section class="card" aria-labelledby="launch-title">
    <h2 id="launch-title">Запуск</h2>
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
    <h2 id="team-title" class="section-title">Команда</h2>
    <div class="agents__grid">
${set.agents.map((a) => agentCard(a, set.wave)).join('\n')}
    </div>
  </section>
  <section class="cabinet">
    <article class="card">
      <h2>Площадки</h2>
      ${platformsBlock(h)}
    </article>
    <article class="card">
      <h2>Управляющий и Telegram</h2>
      ${telegramBlock(h)}
      ${ownerForm(h)}
    </article>
  </section>
  <section class="card" aria-labelledby="profile-title">
    <h2 id="profile-title">Эталон объекта</h2>
    <p class="hint">Единый источник правды для всех агентов: по нему сверяются карточки и сайт, из него собираются ответы гостям.</p>
    ${profileForm(h)}
  </section>
  <section class="cabinet">
    <article class="card">
      <h2>Сообщения управляющего</h2>
      ${feedBlock(s.feed)}
    </article>
    <article class="card">
      <h2>Вебхуки объекта</h2>
      ${hookBlock(s.goldfishUrl)}
    </article>
  </section>
</main>`,
  );
}
