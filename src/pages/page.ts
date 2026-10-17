import type { AccessState } from '../access.js';
import type { AssetUrls } from '../static.js';
import type { UserRecord } from '../store/types.js';
import { botsBlock, type BotsState } from './bots.js';

export type Notice = 'login_denied' | 'login_expired' | 'login_error' | 'download_unavailable';

export interface View {
  assets: AssetUrls;
  goldfishUrl: string;
  privacyUrl?: string | undefined;
  supportEmail?: string | undefined;
  /** How long a sign-in lasts (SESSION_DAYS), told on the landing. */
  sessionDays?: number | undefined;
  /** The site links MAX and WhatsApp too, not only Telegram (a bots server, BOTS_URL). */
  messengers?: boolean | undefined;
}

interface PageState extends View {
  user: UserRecord | null;
  access: AccessState | null;
  notice: Notice | null;
  /** The bots in the messengers: undefined when the site has no bots server (BOTS_URL). */
  bots?: BotsState | undefined;
}

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** «Как это сделать?» next to a place on the site: the guide's answer about it (/help#id). */
export const helpLink = (id: string, text = 'Как это сделать?') =>
  `<a class="help-link" href="/help#${esc(id)}">${esc(text)}</a>`;

/** Tabs of the agents page («Сегодня», «Команда», «Объект», «Настройки»), opened by `?tab=`. */
export const AGENT_TABS = ['today', 'team', 'property', 'settings'] as const;
export type AgentTab = (typeof AGENT_TABS)[number];

/** The tab of the agents page each of its anchors is on. */
const ANCHOR_TAB = {
  'first-title': 'today',
  'approvals-title': 'today',
  'kpi-title': 'today',
  'feed-title': 'today',
  'launch-title': 'team',
  'team-title': 'team',
  'profile-title': 'property',
  'listings-title': 'property',
  'competitors-title': 'property',
  'platforms-title': 'settings',
  'telegram-title': 'settings',
  'hooks-title': 'settings',
} as const satisfies Record<string, AgentTab>;
export type AgentAnchor = keyof typeof ANCHOR_TAB;

/** A place on the agents page: its tab opens without a script too, then the anchor. */
export const agentsHref = (anchor: AgentAnchor) => `/agents?tab=${ANCHOR_TAB[anchor]}#${anchor}`;

const NOTICE_TEXT: Record<Notice, string> = {
  login_denied: 'Вход отменён. Чтобы получить доступ, разрешите сайту доступ к профилю Яндекс ID.',
  login_expired: 'Ссылка для входа устарела. Нажмите «Войти» ещё раз.',
  login_error: 'Не удалось войти через Яндекс ID. Попробуйте ещё раз через минуту.',
  download_unavailable: 'Пакет расширения сейчас недоступен. Попробуйте позже или напишите нам.',
};

const LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M21.8 14.7 30.4 3.9v24.2l-8.6-10.8z" fill="#f78c28"/><ellipse cx="14" cy="16" rx="10.9" ry="7.7" fill="#e8590c"/><circle cx="8.6" cy="14.4" r="2" fill="#fff"/></svg>`;

const YANDEX_MARK = `<svg class="ya" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#fc3f1d"/><text x="12" y="17" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#fff">Я</text></svg>`;

export const ICONS = {
  channels: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h10"/><path d="m17 15 2 2 3-4"/></svg>`,
  prices: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>`,
  guests: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/></svg>`,
  reputation: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>`,
  direct: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11v2a2 2 0 0 0 2 2h2l5 4V5L7 9H5a2 2 0 0 0-2 2z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>`,
  manager: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`,
};

export function layout(v: View, title: string, body: string): string {
  // The landing keeps these sections for guests and signed-in users alike, so the links hold.
  const footerLinks = [
    `<a href="/#security">Безопасность</a>`,
    `<a href="/#data">Персональные данные</a>`,
    `<a href="/help">Инструкция</a>`,
    v.privacyUrl ? `<a href="${esc(v.privacyUrl)}">Политика обработки данных</a>` : '',
    v.supportEmail ? `<a href="mailto:${esc(v.supportEmail)}">${esc(v.supportEmail)}</a>` : '',
  ].filter(Boolean);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Goldfish — команда AI-агентов для гостевого дома и отеля: сверка цен и броней на площадках, ответы гостям за минуты, отзывы, реклама и утренняя сводка владельцу в Telegram.">
<link rel="icon" href="${v.assets['favicon.ico']}" sizes="48x48">
<link rel="icon" href="${v.assets['favicon.svg']}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${v.assets['apple-touch-icon.png']}">
<link rel="stylesheet" href="${v.assets['style.css']}">
<script src="${v.assets['app.js']}" defer></script>
</head>
<body>
${body}
<footer class="footer wrap">
  <span>© ${new Date().getFullYear()} Goldfish</span>
  ${footerLinks.join('\n  ')}
</footer>
</body>
</html>`;
}

export function header(user: UserRecord | null): string {
  const right = user
    ? `<div class="me">
        ${user.avatarId ? `<img class="avatar" src="https://avatars.yandex.net/get-yapic/${encodeURIComponent(user.avatarId)}/islands-68" alt="" width="32" height="32">` : `<span class="avatar avatar--empty" aria-hidden="true">${esc((user.name ?? user.login ?? '?').slice(0, 1).toUpperCase())}</span>`}
        <span class="me__name">${esc(user.name ?? user.login ?? 'Профиль')}</span>
        <form method="post" action="/logout"><button class="link" type="submit">Выйти</button></form>
      </div>`
    : `<a class="btn btn--ghost btn--sm" href="/auth/yandex">Войти</a>`;
  return `<header class="top wrap">
  <a class="brand" href="/">${LOGO}<span>Goldfish</span></a>
  <nav class="top__nav" aria-label="Разделы">
    ${
      user
        ? `<a href="/agents">Агенты</a>
    <a href="/#security">Безопасность</a>`
        : `<a href="/#how">Как работает</a>
    <a href="/#security">Безопасность</a>
    <a href="/#data">Данные</a>
    <a href="/#faq">Вопросы</a>`
    }
    <a href="/help">Инструкция</a>
  </nav>
  ${right}
</header>`;
}

function notice(n: Notice | null): string {
  return n ? `<div class="wrap"><p class="notice" role="status">${NOTICE_TEXT[n]}</p></div>` : '';
}

/** Illustration: the manager's morning summary and an approval in Telegram. */
const TELEGRAM = `<div class="panel" aria-hidden="true">
  <div class="panel__bar">${LOGO}<b>Управляющий</b><span class="panel__status">Telegram</span></div>
  <div class="panel__body">
    <div class="tg">
      <p class="tg__line"><b>Доброе утро! Дом у моря, 09.10.</b></p>
      <p class="tg__line">Сегодня заездов — 3, выездов — 2.</p>
      <p class="tg__line">Загрузка: 7 дней — 71%, 30 дней — 54%.</p>
      <p class="tg__line">За сутки 4 брони на 38 400 ₽, отмен — 1.</p>
      <p class="tg__line">Новых отзывов — 2, средняя оценка 4,5.</p>
      <p class="tg__line">Открытых расхождений на площадках — 1.</p>
    </div>
    <div class="confirm">
      <p class="confirm__title">Цены и загрузка: цены за коридором</p>
      <p class="confirm__text">Сб 14.11 «Люкс»: 11 500 ₽ (база 9 000 ₽) — праздник, загрузка 100%</p>
      <div class="confirm__actions"><span class="chip chip--accent">Согласовать</span><span class="chip">Изменить</span><span class="chip">Отклонить</span></div>
    </div>
  </div>
</div>`;

interface AgentCard {
  icon: keyof typeof ICONS;
  title: string;
  text: string;
  duties: string[];
  metrics: string;
}

const AGENTS: AgentCard[] = [
  {
    icon: 'channels',
    title: 'Каналы продаж',
    text: 'Чтобы на каждой площадке были верные цены, свободные номера и описание, а ни один номер не продавался дважды.',
    duties: [
      'каждое утро сверяет цены и наличие на 60 дней между PMS и площадками',
      'переносит новые брони в шахматку, исправляет расхождения',
      'при овербукинге сам закрывает продажу и сразу пишет вам',
    ],
    metrics: 'расхождения, время до исправления, овербукинги',
  },
  {
    icon: 'prices',
    title: 'Цены и загрузка',
    text: 'Работа ревеню-менеджера: сколько стоит ночь на каждую дату.',
    duties: [
      'цены 5–10 конкурентов рядом с цитатой на каждую цифру',
      'загрузка и темп броней, рекомендация цены с объяснением',
      'в вашем коридоре (например, ±10%) меняет цену сам',
    ],
    metrics: 'загрузка, ADR, RevPAR против прошлого года',
  },
  {
    icon: 'guests',
    title: 'Гости',
    text: 'Переписка с гостем от первого вопроса до письма после выезда — по правилам площадки.',
    duties: [
      'отвечает на парковку, заезд, животных за 1–2 минуты',
      'подтверждает брони, пишет до заезда и после выезда',
      'жалобу — черновиком администратору с пометкой «срочно»',
    ],
    metrics: 'время первого ответа, доля вопросов без человека',
  },
  {
    icon: 'reputation',
    title: 'Репутация',
    text: 'Рейтинг и отзывы на площадках бронирования, Яндекс Картах и 2ГИС.',
    duties: [
      'каждый день собирает рейтинги и новые отзывы',
      'отвечает на 4–5 ★ сам, на 1–3 ★ — после вашего «да»',
      'показывает, о чём пишут: чистота, тишина, завтрак, персонал',
    ],
    metrics: 'рейтинг, отзывы за 30 дней, ответ на негатив',
  },
  {
    icon: 'direct',
    title: 'Прямые продажи',
    text: 'Чтобы объект платил меньше комиссии площадкам.',
    duties: [
      'воронка «обращение → бронь» по каналам',
      'расход рекламы против бюджета, маркировка erid',
      'любая трата денег — только после согласования',
    ],
    metrics: 'доля прямых броней, комиссия, стоимость брони',
  },
  {
    icon: 'manager',
    title: 'Управляющий',
    text: 'Единственный, кто говорит с вами: собирает работу остальных агентов.',
    duties: [
      'утренняя сводка в Telegram в 5–7 строк',
      'срочное — с тихими часами и лимитом в день',
      'одна очередь согласований с кнопками',
    ],
    metrics: 'сводка вовремя, время решения по согласованию',
  },
];

const TEAM = `<section class="features wrap" id="team" aria-labelledby="team-title">
  <h2 id="team-title" class="section-title">Команда агентов</h2>
  <p class="section-lead">Пять агентов отвечают за свои участки, шестой — управляющий — собирает их работу для вас. Каждый агент — набор обязанностей по расписанию или событию.</p>
  <div class="grid3">
${AGENTS.map(
  (a) => `    <article class="feature">
      <span class="feature__icon">${ICONS[a.icon]}</span>
      <h3>${a.title}</h3>
      <p>${a.text}</p>
      <details class="feature__more">
        <summary>Что делает</summary>
        <ul class="ticks">${a.duties.map((d) => `<li>${d}</li>`).join('')}</ul>
        <p class="feature__metrics">Показатели: ${a.metrics}</p>
      </details>
    </article>`,
).join('\n')}
  </div>
</section>`;

/** Line icons of the landing, drawn like ICONS. */
const MARKS = {
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>`,
  owner: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`,
  server: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>`,
  browser: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01"/></svg>`,
  hotel: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5l8-2v18M12 9l8 2v10M2 21h20M8 8h.01M8 12h.01M8 16h.01M16 14h.01M16 18h.01"/></svg>`,
  key: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.7-8.7M17 6l2.5 2.5M14.5 8.5l2 2"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  checks: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 12.5 4 4 8-9"/><path d="m10 15 1.5 1.5 8-9"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>`,
  page: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>`,
  quote: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7H6a2 2 0 0 0-2 2v3h6zM10 12c0 3-1.5 5-4 6M20 7h-4a2 2 0 0 0-2 2v3h6zM20 12c0 3-1.5 5-4 6"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/></svg>`,
  ban: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/></svg>`,
  login: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/></svg>`,
};

const WHY: Array<{ title: string; text: string }> = [
  {
    title: 'Цены и свободные номера разъезжаются',
    text: 'На каждой площадке своя шахматка. «Каналы продаж» каждое утро сверяют цены и наличие на 60 дней вперёд, исправляют расхождения и закрывают продажу при овербукинге.',
  },
  {
    title: 'Гость ждёт ответа часами',
    text: 'Пока вы заняты, гость бронирует у соседей. «Гости» отвечают на типовые вопросы — парковка, заезд, животные — за 1–2 минуты по вашим утверждённым ответам.',
  },
  {
    title: 'Отзывы остаются без ответа',
    text: '«Репутация» каждый день собирает отзывы с площадок, Яндекс Карт и 2ГИС, отвечает на хорошие, а на плохие готовит ответ вам на согласование.',
  },
  {
    title: 'Цена ставится на глаз',
    text: '«Цены и загрузка» сами находят прямых конкурентов, читают их цены с цитатой со страницы и советуют цену на каждую дату с объяснением.',
  },
  {
    title: 'Комиссии съедают выручку',
    text: '«Прямые продажи» показывают, во что обходится бронь в каждом канале, и следят за рекламой и бюджетом. Любая трата денег — только после вашего согласования.',
  },
  {
    title: 'Десять кабинетов каждый день',
    text: 'Вместо обхода кабинетов — одна сводка от «Управляющего» в Telegram: заезды, загрузка, брони, отзывы и то, что ждёт вашего решения.',
  },
];

const WHY_SECTION = `<section class="features wrap" id="why" aria-labelledby="why-title">
  <h2 id="why-title" class="section-title">Зачем это нужно</h2>
  <p class="section-lead">В небольшом объекте владелец — сам себе администратор, ревеню-менеджер и маркетолог. Goldfish забирает рутину, которая отнимает часы каждый день, а пропущенная — стоит денег.</p>
  <div class="grid3">
${WHY.map(
  (w) => `    <article class="feature feature--plain">
      <h3>${w.title}</h3>
      <p>${w.text}</p>
    </article>`,
).join('\n')}
  </div>
</section>`;

const SYSTEMS = [
  'Bnovo',
  'TravelLine',
  'Контур.Отель',
  'Shelter',
  'Realty Calendar',
  'шахматка в таблице',
  'Островок',
  'Яндекс Путешествия',
  'Авито',
  '101Hotels',
  'OneTwoTrip',
  'Ozon Travel',
  'roomlink',
  'Академсервис',
  'Алеан',
  'Bronevik.com',
  'hotelbook',
  'Яндекс Карты',
  '2ГИС',
  'Яндекс Директ',
  'VK Реклама',
  'Telegram',
];

/** Where each part works: the owner, the agents on the server, the extension, the systems. */
const FLOW: Array<{ icon: keyof typeof MARKS; title: string; text: string }> = [
  { icon: 'owner', title: 'Вы', text: 'Сводка, согласования и команды — в Telegram и на сайте' },
  {
    icon: 'server',
    title: 'Агенты на сервере',
    text: 'Решают, что пора сделать, и ставят задания исполнителям',
  },
  {
    icon: 'browser',
    title: 'Расширение в браузере',
    text: 'Читает страницы и нажимает кнопки, проверяя риск каждого шага',
  },
  { icon: 'hotel', title: 'PMS и площадки', text: 'Открыты с вашими входами — пароли не нужны' },
];

const how = (v: View) => `<section class="how wrap" id="how" aria-labelledby="how-title">
  <h2 id="how-title" class="section-title">Как это работает</h2>
  <p class="section-lead">Агенты думают на сервере Goldfish, а действуют в вашем браузере — там, где вы уже вошли в PMS и кабинеты площадок. Поэтому им не нужны ваши пароли.</p>
  <ol class="flow">
${FLOW.map(
  (f) => `    <li class="flow__node">
      <span class="feature__icon">${MARKS[f.icon]}</span>
      <b>${f.title}</b>
      <span>${f.text}</span>
    </li>`,
).join('\n')}
  </ol>
  <ol class="steps steps--4">
    <li><b>Агент решает, что пора сделать</b> — по расписанию (сверка каждое утро) или по событию: новое сообщение гостя, бронь, отзыв.</li>
    <li><b>Ставит задание исполнителям</b>: один только читает страницы, другой меняет данные. Частые задания повторяются по запомненному пути — быстрее и без затрат на модель.</li>
    <li><b>Расширение выполняет его в вашем браузере</b> — в отдельной вкладке, с вашими входами. Каждую цифру агент подтверждает дословной цитатой со страницы.</li>
    <li><b>Важное — после проверки и вашего «да»</b>: перед отправкой или сохранением действие проверяют код и отдельная модель-проверяющий, а решения приходят кнопками в Telegram.</li>
  </ol>
  <div class="needs">
    <div>
      <h3>Что нужно для работы</h3>
      <ul class="ticks">
        <li>Компьютер с Chrome 116+, Яндекс Браузером или Edge и расширением Goldfish.</li>
        <li>Вход в PMS и кабинеты площадок в этом браузере — агенты работают в ваших сессиях.</li>
        <li>Открытый браузер. Пока компьютер выключен, задания ждут, а о сообщениях гостей агент узнаёт из пересланных писем площадок и вебхуков PMS.</li>
        <li>${v.messengers ? 'Telegram, MAX или WhatsApp' : 'Telegram'} — для сводки и согласований. Без мессенджера всё видно на сайте.</li>
      </ul>
    </div>
    <div>
      <h3>С чем работают агенты</h3>
      <p class="muted">Через обычный интерфейс в браузере, как человек, — подключать API не нужно. Нет PMS — подойдёт шахматка в таблице.</p>
      <p class="systems" aria-label="Системы">${SYSTEMS.map((x) => `<span class="chip">${x}</span>`).join(' ')}</p>
    </div>
  </div>
</section>`;

const LEVELS: Array<{ id: string; title: string; text: string; example: string }> = [
  {
    id: 'self',
    title: 'Сам',
    text: 'Читает, считает и пишет по утверждённому шаблону.',
    example: 'сверка цен, сбор отзывов, письмо после выезда',
  },
  {
    id: 'rule',
    title: 'Правило',
    text: 'Действует сам в вашем лимите, за лимитом — спрашивает.',
    example: 'цена в коридоре ±10%, ответ на отзыв 4–&#8288;5&nbsp;★',
  },
  {
    id: 'approval',
    title: 'Согласование',
    text: 'Каждое действие подтверждаете вы.',
    example: 'ответ на отзыв 1–&#8288;3&nbsp;★, правка карточки, любая трата денег',
  },
  {
    id: 'off',
    title: 'Выкл',
    text: 'Обязанность ничего не делает и не тратит токены.',
    example: 'реклама, пока она вам не нужна',
  },
];

const CONTROL = `<section class="features wrap" id="control" aria-labelledby="rules-title">
  <h2 id="rules-title" class="section-title">Решения — за вами</h2>
  <p class="section-lead">У каждой обязанности агента свой уровень прав: вы решаете, что агент делает сам, а что — только после вашего «да». Поднять права может только владелец, а для трат денег выше «Согласования» их не поднять.</p>
  <ol class="levels">
${LEVELS.map(
  (l) => `    <li class="level level--${l.id}">
      <b>${l.title}</b>
      <span>${l.text}</span>
      <small>Например: ${l.example}</small>
    </li>`,
).join('\n')}
  </ol>
  <div class="grid3">
    <article class="feature feature--plain">
      <h3>Одна очередь согласований</h3>
      <p>Что, почему и сколько стоит — с кнопками «Согласовать», «Изменить», «Отклонить» в Telegram и на сайте. Нет ответа за сутки — напоминание, а действие не выполняется; через 72 часа согласование истекает.</p>
    </article>
    <article class="feature feature--plain">
      <h3>Правила площадок</h3>
      <p>Каждое сообщение гостю, ответ на отзыв и правка карточки проверяются по реестру правил площадок до отправки: контакты раньше времени, оплата мимо площадки, призыв бронировать напрямую. Изменения правил ловит отдельный агент.</p>
    </article>
    <article class="feature feature--plain">
      <h3>Выключить можно всё</h3>
      <p>Агента, обязанность, площадку, права или поставить паузу — командой в Telegram («выключи рекламу», «пауза до 15.11 ремонт») или на странице настроек. Выключенное не открывает кабинеты и не тратит токены.</p>
    </article>
  </div>
</section>`;

const WAVES = `<section class="how wrap" aria-labelledby="waves-title">
  <h2 id="waves-title" class="section-title">Запуск волнами</h2>
  <p class="section-lead">Агенты по умолчанию выключены. Новые обязанности включаются по волнам — сначала агенты только смотрят, а действуют, когда вы им доверяете.</p>
  <ol class="steps">
    <li><b>Видеть всё и не терять брони.</b> Сверка площадок и защита от овербукинга, сводка и срочное, конкуренты и загрузка, сбор отзывов, письмо после выезда.</li>
    <li><b>Отвечать и советовать.</b> Ответы гостям и на отзывы, рекомендации цен, аналитика рекламы и каналов, согласования в Telegram.</li>
    <li><b>Действовать по правилам.</b> Цены сами в коридоре, акции под пустые даты, управление рекламой, рассылки постоянным гостям, сайт и фото.</li>
  </ol>
</section>`;

const SAFETY: Array<{ icon: keyof typeof MARKS; title: string; text: string }> = [
  {
    icon: 'key',
    title: 'Пароли агентам не нужны',
    text: 'Вы входите в кабинеты сами, агенты работают в открытой сессии. Пароли, коды из SMS и данные карт агент не вводит и не видит — такие поля скрыты прямо на странице. Пароли не хранятся ни на сайте, ни на сервере.',
  },
  {
    icon: 'lock',
    title: 'Вход и настройки аккаунтов закрыты',
    text: 'Яндекс ID, Госуслуги, Сбер ID, VK ID, менеджеры паролей, страницы смены пароля и двухфакторной защиты: расширение их не читает и разрешает только уйти. Сервер это правило не отключит.',
  },
  {
    icon: 'checks',
    title: 'Двойная проверка необратимого',
    text: 'Отправку, сохранение и удаление сначала проверяет код — значения формы, обязательные поля, форматы, — затем отдельная модель-проверяющий. При сомнении решаете вы. Отменить бронь агент не может вовсе.',
  },
  {
    icon: 'shield',
    title: 'Расширение перепроверяет сервер',
    text: 'С сервера приходит только фиксированный набор команд — код в браузере не выполняется. Расширение само оценивает риск каждого клика, а «Стоп» срабатывает сразу, даже без связи с сервером.',
  },
  {
    icon: 'page',
    title: 'Текст страниц — данные, а не команды',
    text: 'Надпись на сайте «перейди туда-то и введи данные» агент не выполнит. Вводить данные можно только на сайтах задания; незнакомый адрес или ввод на чужом сайте — после вашего подтверждения.',
  },
  {
    icon: 'quote',
    title: 'Цифры — только с цитатой',
    text: 'Цену, рейтинг или расхождение агент принимает, только если дословная цитата есть на странице. Выдуманные цифры не проходят, а у каждой цены видны ссылка и цитата.',
  },
  {
    icon: 'pause',
    title: 'Сбой не повторяет действие',
    text: 'Если связь оборвалась во время отправки, действие не повторяется вслепую: его исход помечается как неизвестный, и решает человек. Так повтор не задвоит сообщение гостю или правку.',
  },
  {
    icon: 'ban',
    title: 'Ваш список запрещённых сайтов',
    text: 'Банк, почта — что угодно: агент не откроет и не прочитает эти сайты ни при каких указаниях. Капчи не обходятся, число действий на сайте ограничено.',
  },
  {
    icon: 'login',
    title: 'Вход и токены',
    text: 'Пароль Яндекса вы вводите только у Яндекса; его токен сайт использует один раз и не хранит. Токен расширения показывается один раз, на сервере лежит только его хеш, а новый сразу отключает старый.',
  },
];

const SECURITY = `<section class="band" id="security" aria-labelledby="security-title">
  <div class="wrap">
    <h2 id="security-title" class="section-title">Безопасность</h2>
    <p class="section-lead">Агенты действуют от вашего имени, поэтому защита встроена в каждый шаг — на сервере и в самом расширении. Всё рискованное проверяется дважды, а последнее слово — за вами.</p>
    <div class="grid3">
${SAFETY.map(
  (s) => `      <article class="feature">
        <span class="feature__icon">${MARKS[s.icon]}</span>
        <h3>${s.title}</h3>
        <p>${s.text}</p>
      </article>`,
).join('\n')}
    </div>
  </div>
</section>`;

const pd = (s: string) => `<mark class="pd">${s}</mark>`;
const ph = (s: string) => `<code class="ph">{{${s}}}</code>`;

const PHONE = '+7&nbsp;912&nbsp;345‑67‑89';
const EMAIL = 'anna@mail.ru';

/** One request on its way: as written, as the model sees it, as it reaches the PMS form. */
const MASKING = `<ol class="mask">
    <li class="mask__step">
      <p class="mask__label">Вы пишете управляющему</p>
      <p class="mask__text">Внеси бронь в шахматку: Анна, ${pd(PHONE)}, ${pd(EMAIL)}, 12–14 ноября, «Люкс»</p>
      <p class="mask__note">Сервер находит телефон и e-mail и заменяет их метками.</p>
    </li>
    <li class="mask__step">
      <p class="mask__label">Модель видит</p>
      <p class="mask__text">Внеси бронь в шахматку: Анна, ${ph('phone_1')}, ${ph('email_1')}, 12–14 ноября, «Люкс»</p>
      <p class="mask__note">Модель понимает, что это телефон и e-mail, но не знает их — и вписывает в форму метки.</p>
    </li>
    <li class="mask__step">
      <p class="mask__label">В форму PMS вводится</p>
      <p class="mask__text mask__form"><span>Гость</span> Анна<br><span>Телефон</span> ${pd(PHONE)}<br><span>E-mail</span> ${pd(EMAIL)}</p>
      <p class="mask__note">Настоящие значения сервер подставляет в последний момент — в команду вашему браузеру.</p>
    </li>
  </ol>`;

const days = (n: number) => {
  const tens = n % 100;
  const ones = n % 10;
  const word =
    tens >= 11 && tens <= 14
      ? 'дней'
      : ones === 1
        ? 'день'
        : ones >= 2 && ones <= 4
          ? 'дня'
          : 'дней';
  return `${n} ${word}`;
};

/** What is kept where and for how long; retention is the defaults of the site and Goldfish. */
const stored = (sessionDays: number): Array<{ what: string; where: string; how: string }> => [
  {
    what: 'Профиль Яндекс ID: имя, e-mail, логин, аватар',
    where: 'сайт; имя и e-mail — и на сервере Goldfish',
    how: 'пока есть аккаунт',
  },
  { what: 'Вход на сайт', where: 'сайт — только хеш сессии', how: days(sessionDays) },
  {
    what: 'Токен расширения',
    where: 'сервер — только хеш; сайт — только номер токена',
    how: 'до выпуска нового',
  },
  {
    what: 'Эталон объекта, брони и гости, показатели, решения агентов',
    where: 'сервер Goldfish',
    how: 'пока есть аккаунт',
  },
  {
    what: 'Задания, диалог с ассистентом и его память',
    where: 'сервер Goldfish, исходный текст',
    how: 'пока есть аккаунт; диалог можно удалить в боковой панели',
  },
  {
    what: 'Проверки необратимых действий с данными форм',
    where: 'сервер Goldfish',
    how: '180 дней',
  },
  {
    what: 'Журнал ошибок — токены и коды в адресах скрыты',
    where: 'сервер Goldfish',
    how: '30 дней',
  },
  {
    what: 'Пароли, коды из SMS, данные карт, токен Яндекса',
    where: 'нигде',
    how: '—',
  },
];

function dataSection(v: View): string {
  const write = v.supportEmail
    ? `напишите на <a href="mailto:${esc(v.supportEmail)}">${esc(v.supportEmail)}</a>`
    : 'напишите нам';
  return `<section class="features wrap" id="data" aria-labelledby="data-title">
  <h2 id="data-title" class="section-title">Персональные данные</h2>
  <p class="section-lead">Модели, которые планируют работу и пишут тексты, — внешние. Поэтому телефоны, e-mail и документы из ваших заданий и сообщений до них не доходят: модель видит метки, а настоящие значения подставляются только на пути в ваш браузер.</p>
  ${MASKING}
  <div class="grid3">
    <article class="feature feature--plain">
      <h3>Что заменяется метками</h3>
      <p>Телефоны, e-mail, номера банковских карт, паспорт, ИНН и СНИЛС — в заданиях, сообщениях ассистенту и управляющему, в памяти и сводках диалога. Если такое значение встретится на странице, его тоже скроют, прежде чем текст увидит модель. Один телефон в любом написании — одна метка.</p>
    </article>
    <article class="feature feature--plain">
      <h3>Что модель видит как есть</h3>
      <p>Имена, адреса и данные со страниц, которых не было в задании, — например, имя гостя в переписке на площадке. Сайты, где таким данным не место, добавьте в список запрещённых в настройках расширения — агент их не откроет.</p>
    </article>
    <article class="feature feature--plain">
      <h3>Где настоящие значения</h3>
      <p>В вашем браузере и в PMS или на площадке, куда агент их вводит, а также на сервере Goldfish — в истории заданий и диалога, чтобы вы видели её как есть. Доступ к ней — у вас и у администратора сервиса для поддержки. Модель-проверяющий на нашем сервере видит значения, внешняя — только метки.</p>
    </article>
  </div>
  <h3 class="sub-title" id="stored">Что и где хранится</h3>
  <table class="stored">
    <thead><tr><th scope="col">Что</th><th scope="col">Где</th><th scope="col">Сколько</th></tr></thead>
    <tbody>
${stored(v.sessionDays ?? 30)
  .map(
    (r) =>
      `      <tr><th scope="row">${r.what}</th><td data-label="Где">${r.where}</td><td data-label="Сколько">${r.how}</td></tr>`,
  )
  .join('\n')}
    </tbody>
  </table>
  <div class="rights">
    <h3>Ваши права</h3>
    <p>Чтобы узнать, какие данные о вас хранятся, исправить или удалить их, ${write}. Если доступ отключается, задачи останавливаются, но данные не удаляются — после продления всё продолжится с того же места.${v.privacyUrl ? ` Подробно — в <a href="${esc(v.privacyUrl)}">политике обработки данных</a>.` : ''}</p>
  </div>
</section>`;
}

const start = (v: View) => `<section class="how wrap" id="start" aria-labelledby="start-title">
  <h2 id="start-title" class="section-title">Как начать</h2>
  <ol class="steps">
    <li><b>Войдите</b> через Яндекс ID и установите расширение в браузер, где открыты ваши PMS и кабинеты площадок.</li>
    <li><b>Заполните эталон объекта</b>: пришлите ссылку на карточку на Авито или Яндекс Путешествиях — агент перенесёт номера, цены, правила и удобства, вы проверите и примените.</li>
    <li><b>Включите агентов</b> одной кнопкой и привяжите ${v.messengers ? 'мессенджер' : 'Telegram'} — первая сводка придёт утром.</li>
  </ol>
</section>`;

function faq(v: View): Array<{ id: string; q: string; a: string }> {
  const write = v.supportEmail
    ? `напишите на <a href="mailto:${esc(v.supportEmail)}">${esc(v.supportEmail)}</a>`
    : 'напишите нам';
  return [
    {
      id: 'faq-passwords',
      q: 'Нужно ли давать агентам пароли?',
      a: 'Нет. Вы сами входите в PMS и кабинеты площадок в своём браузере, агенты работают в уже открытой сессии. Пароли не хранятся ни на сайте, ни на сервере, а поля паролей и кодов агент не видит.',
    },
    {
      id: 'faq-mistake',
      q: 'Что, если агент ошибётся?',
      a: 'Необратимые действия проверяют код и модель-проверяющий, при сомнении спрашивают вас. Права по умолчанию осторожные, а обязанности включаются волнами — сначала агенты только смотрят. Любое задание останавливает кнопка «Стоп» в боковой панели расширения.',
    },
    {
      id: 'faq-stop',
      q: 'Как всё остановить или выключить часть?',
      a: 'Каждого агента, обязанность и площадку можно выключить отдельно, а площадке — оставить только чтение. На ремонт или межсезонье — пауза: «пауза до 15.11 ремонт» управляющему в Telegram или кнопка на странице агентов.',
    },
    {
      id: 'faq-computer',
      q: 'Нужно ли держать компьютер включённым?',
      a: 'Агенты работают в вашем браузере, поэтому он должен быть открыт. Пока компьютер выключен, задания ждут и выполнятся, когда вы его включите. О сообщениях гостей ночью агент узнаёт из пересланных писем площадок и вебхуков PMS.',
    },
    {
      id: 'faq-rules',
      q: 'Агенты не нарушат правила площадок?',
      a: 'Каждое сообщение гостю, ответ на отзыв и правку карточки код проверяет по реестру правил площадок до отправки. Служебный агент раз в неделю перечитывает правила и оферты площадок; если что-то изменилось, затронутые действия переходят на согласование, пока правку не проверят.',
    },
    {
      id: 'faq-price',
      q: 'Сколько это стоит?',
      a: 'Сейчас идёт ранний доступ для пилотных объектов: доступ открывается сразу после входа через Яндекс ID. Тарифы появятся позже.',
    },
    {
      id: 'faq-leave',
      q: 'Что будет с данными, если я перестану пользоваться?',
      a: `Когда доступ отключается, задачи останавливаются и расширение отключается от сервера, но данные не удаляются: после продления всё продолжится с того же места. Чтобы удалить данные, ${write}.`,
    },
  ];
}

function faqSection(v: View): string {
  return `<section class="features wrap" id="faq" aria-labelledby="faq-title">
  <h2 id="faq-title" class="section-title">Вопросы</h2>
  <div class="faq">
${faq(v)
  .map(
    (f) => `    <details class="guide-item" id="${f.id}">
      <summary>${f.q}</summary>
      <div class="guide-item__body"><p>${f.a}</p></div>
    </details>`,
  )
  .join('\n')}
  </div>
  <p class="muted">Пошагово по каждому сценарию — в <a href="/help">инструкции</a>.</p>
</section>`;
}

const ASSURE = [
  'Пароли не нужны — агенты работают в вашем браузере',
  'Важное — только после вашего «да»',
  'Телефоны и e-mail скрыты от моделей',
];

function guest(v: View): string {
  return `<section class="hero wrap">
  <div class="hero__text">
    <p class="eyebrow">Для гостевых домов, мини-отелей и апартаментов</p>
    <h1>Команда AI-агентов для вашего объекта размещения</h1>
    <p class="lead">Шесть агентов-сотрудников сверяют цены и брони на площадках, отвечают гостям за минуты, следят за отзывами и рекламой. Управляющий присылает в Telegram короткую сводку и кнопки согласований — решения остаются за вами.</p>
    <div class="cta">
      <a class="btn btn--yandex" href="/auth/yandex">${YANDEX_MARK}Войти с Яндекс ID</a>
      <a class="btn btn--ghost" href="#how">Как это работает</a>
      <span class="cta__note">Ранний доступ для пилотных объектов</span>
    </div>
    <ul class="assure">
${ASSURE.map((a) => `      <li>${MARKS.check}${a}</li>`).join('\n')}
    </ul>
  </div>
  ${TELEGRAM}
</section>
${WHY_SECTION}
${how(v)}
${TEAM}
${CONTROL}
${WAVES}
${SECURITY}
${dataSection(v)}
${start(v)}
${faqSection(v)}
<section class="wrap final" aria-labelledby="final-title">
  <div class="final__box">
    <h2 id="final-title">Попробуйте на своём объекте</h2>
    <p>Вход через Яндекс ID, расширение и эталон по ссылке на карточку — первая сводка придёт утром.</p>
    <a class="btn btn--yandex" href="/auth/yandex">${YANDEX_MARK}Войти с Яндекс ID</a>
  </div>
</section>`;
}

/** Step 4 of the cabinet: QR codes that link the owner's Telegram, MAX or WhatsApp. */
function botsCard(bots: BotsState): string {
  return `<article class="card card--wide" id="bots" aria-labelledby="bots-title">
    <div class="card__head"><h2 id="bots-title"><span class="num">4</span>Управляйте агентами из мессенджера</h2>${helpLink('bots', 'Что умеет бот?')}</div>
    <p>Привяжите Telegram, MAX или WhatsApp: согласовывайте решения агентов, поручайте им задачи, включайте и выключайте агентов прямо из чата. Туда же придут утренняя сводка и срочное.</p>
    ${botsBlock(bots, { unlink: false, refreshHref: '/#bots', agentsHref: agentsHref('telegram-title') })}
  </article>`;
}

function cabinet(
  user: UserRecord,
  access: AccessState,
  goldfishUrl: string,
  bots?: BotsState,
): string {
  const first = (user.name ?? user.login ?? '').split(/\s+/)[0] ?? '';
  if (!access.allowed)
    return `<section class="hero hero--user wrap">
  <div class="hero__text">
    <p class="eyebrow eyebrow--warn">Доступа нет</p>
    <h1>Здравствуйте${first ? `, ${esc(first)}` : ''}!</h1>
    <p class="lead">${esc(access.reason)}</p>
  </div>
</section>`;
  const issued = user.tokenIssuedAt
    ? `<p class="hint" id="token-hint">Токен выдан ${esc(new Date(user.tokenIssuedAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }))}. Потеряли — выпустите новый: старый сразу перестанет работать.</p>`
    : `<p class="hint" id="token-hint">Токен показывается один раз — сразу вставьте его в расширение.</p>`;
  return `<section class="hero hero--user wrap">
  <div class="hero__text">
    <p class="eyebrow eyebrow--ok"><span class="dot"></span>${esc(access.label)} · доступ открыт</p>
    <h1>Здравствуйте${first ? `, ${esc(first)}` : ''}!</h1>
    <p class="lead">${bots ? 'Четыре шага' : 'Три шага'} — и команда агентов работает на ваш объект.</p>
  </div>
</section>
<section class="cabinet wrap" aria-label="Установка и подключение">
  <article class="card" id="install">
    <h2><span class="num">1</span>Установите расширение</h2>
    <a class="btn btn--accent" href="/download">Скачать расширение</a>
    <ol class="list">
      <li>Распакуйте zip в постоянную папку — не удаляйте её после установки.</li>
      <li>Откройте <code>chrome://extensions</code> <button class="link" type="button" data-copy="chrome://extensions">скопировать</button> и включите «Режим разработчика».</li>
      <li>Нажмите «Загрузить распакованное» и выберите эту папку.</li>
      <li>Закрепите значок Goldfish на панели и нажмите на него — откроется боковая панель.</li>
    </ol>
    <p class="hint">Нужен Chrome 116+ или другой браузер на Chromium: Яндекс Браузер, Edge. ${helpLink('install', 'Подробная инструкция')}</p>
  </article>
  <article class="card" id="connect">
    <h2><span class="num">2</span>Подключите к серверу</h2>
    <p>Вставьте в боковой панели расширения:</p>
    <label class="field">
      <span class="field__label">Адрес сервера</span>
      <span class="field__row"><input id="server-url" readonly value="${esc(goldfishUrl)}"><button class="btn btn--ghost btn--sm" type="button" data-copy-from="server-url">Копировать</button></span>
    </label>
    <div class="field">
      <span class="field__label">Токен</span>
      <div class="field__row" id="token-row" hidden><input id="token" readonly aria-label="Токен" spellcheck="false"><button class="btn btn--ghost btn--sm" type="button" data-copy-from="token">Копировать</button></div>
      <button class="btn ${user.tokenIssuedAt ? 'btn--ghost' : 'btn--accent'}" type="button" id="issue-token" data-has-token="${user.tokenIssuedAt ? '1' : ''}">${user.tokenIssuedAt ? 'Выпустить новый токен' : 'Получить токен'}</button>
      <p class="error" id="token-error" role="alert" hidden></p>
      ${issued}
    </div>
    <p class="hint">Нажмите «Сохранить» — индикатор «Подключено» значит, что агенты могут работать в вашем браузере. ${helpLink('indicator', 'Что значат другие надписи?')}</p>
  </article>
  <article class="card card--wide">
    <h2><span class="num">3</span>Настройте агентов объекта</h2>
    <p>Заполните эталон объекта (можно по ссылке на карточку Авито или Яндекс Путешествий), включите агентов и привяжите ${bots ? 'мессенджер' : 'Telegram'} — управляющий пришлёт сводку и согласования.</p>
    <div class="row">
      <a class="btn btn--accent" href="/agents">Перейти к агентам</a>
      <a class="btn btn--ghost" href="/help">Инструкция по всем сценариям</a>
    </div>
  </article>
  ${bots ? botsCard(bots) : ''}
</section>`;
}

export function renderPage(s: PageState): string {
  // Signed in, the cabinet comes first; the team, security and data stay on the page for reference.
  const main =
    s.user && s.access
      ? `${cabinet(s.user, s.access, s.goldfishUrl, s.bots)}
${TEAM}
${SECURITY}
${dataSection(s)}`
      : guest(s);
  return layout(
    s,
    'Goldfish — агенты для гостевого дома и отеля',
    `${header(s.user)}
${notice(s.notice)}
<main>
${main}
</main>`,
  );
}

export function renderNotFound(v: View): string {
  return layout(
    v,
    'Страница не найдена — Goldfish',
    `${header(null)}
<main class="wrap empty">
  <h1>Страница не найдена</h1>
  <p class="lead"><a href="/">На главную</a></p>
</main>`,
  );
}
