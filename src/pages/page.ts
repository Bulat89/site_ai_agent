import type { AccessState } from '../access.js';
import type { AssetUrls } from '../static.js';
import type { UserRecord } from '../store/types.js';

export type Notice = 'login_denied' | 'login_expired' | 'login_error' | 'download_unavailable';

interface View {
  assets: AssetUrls;
  goldfishUrl: string;
  privacyUrl?: string | undefined;
  supportEmail?: string | undefined;
}

interface PageState extends View {
  user: UserRecord | null;
  access: AccessState | null;
  notice: Notice | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const NOTICE_TEXT: Record<Notice, string> = {
  login_denied: 'Вход отменён. Чтобы получить доступ, разрешите сайту доступ к профилю Яндекс ID.',
  login_expired: 'Ссылка для входа устарела. Нажмите «Войти» ещё раз.',
  login_error: 'Не удалось войти через Яндекс ID. Попробуйте ещё раз через минуту.',
  download_unavailable: 'Пакет расширения сейчас недоступен. Попробуйте позже или напишите нам.',
};

const LOGO = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><path d="M21.8 14.7 30.4 3.9v24.2l-8.6-10.8z" fill="#f78c28"/><ellipse cx="14" cy="16" rx="10.9" ry="7.7" fill="#e8590c"/><circle cx="8.6" cy="14.4" r="2" fill="#fff"/></svg>`;

const YANDEX_MARK = `<svg class="ya" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#fc3f1d"/><text x="12" y="17" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#fff">Я</text></svg>`;

const ICONS = {
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>`,
  hand: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6.5"/></svg>`,
  repeat: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3.5 20.5 7 17 10.5"/><path d="M3.5 12V10a3 3 0 0 1 3-3h14"/><path d="M7 20.5 3.5 17 7 13.5"/><path d="M20.5 12v2a3 3 0 0 1-3 3h-14"/></svg>`,
};

function layout(v: View, title: string, body: string): string {
  const footerLinks = [
    v.privacyUrl ? `<a href="${esc(v.privacyUrl)}">Политика обработки данных</a>` : '',
    v.supportEmail ? `<a href="mailto:${esc(v.supportEmail)}">${esc(v.supportEmail)}</a>` : '',
  ].filter(Boolean);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="Goldfish — AI-агент в вашем браузере: ищет и сравнивает данные, заполняет формы и работает в ваших аккаунтах с подтверждением важных действий.">
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

function header(user: UserRecord | null): string {
  const right = user
    ? `<div class="me">
        ${user.avatarId ? `<img class="avatar" src="https://avatars.yandex.net/get-yapic/${encodeURIComponent(user.avatarId)}/islands-68" alt="" width="32" height="32">` : `<span class="avatar avatar--empty" aria-hidden="true">${esc((user.name ?? user.login ?? '?').slice(0, 1).toUpperCase())}</span>`}
        <span class="me__name">${esc(user.name ?? user.login ?? 'Профиль')}</span>
        <form method="post" action="/logout"><button class="link" type="submit">Выйти</button></form>
      </div>`
    : `<a class="btn btn--ghost btn--sm" href="/auth/yandex">Войти</a>`;
  return `<header class="top wrap">
  <a class="brand" href="/">${LOGO}<span>Goldfish</span></a>
  ${right}
</header>`;
}

function notice(n: Notice | null): string {
  return n ? `<div class="wrap"><p class="notice" role="status">${NOTICE_TEXT[n]}</p></div>` : '';
}

/** Illustration of the side panel: a task, the agent's trace and a confirmation. */
const PANEL = `<div class="panel" aria-hidden="true">
  <div class="panel__bar">${LOGO}<b>Goldfish</b><span class="panel__status">Подключено</span></div>
  <div class="panel__body">
    <p class="bubble bubble--user">Найди три самых дешёвых предложения на робот-пылесос и оформи заказ на лучшее</p>
    <ul class="trace">
      <li class="trace__done">Сравнил 23 предложения на трёх сайтах</li>
      <li class="trace__done">Лучшее — 24 990 ₽, доставка завтра</li>
      <li class="trace__run">Заполняю форму заказа…</li>
    </ul>
    <div class="confirm">
      <p class="confirm__title">Подтвердите действие</p>
      <p class="confirm__text">«Оформить заказ» на 24 990 ₽</p>
      <div class="confirm__actions"><span class="chip chip--accent">Подтвердить</span><span class="chip">Отменить</span></div>
    </div>
  </div>
</div>`;

const FEATURES = `<section class="features wrap" aria-labelledby="features-title">
  <h2 id="features-title" class="section-title">Что умеет</h2>
  <div class="grid3">
    <article class="feature">
      <span class="feature__icon">${ICONS.search}</span>
      <h3>Ищет и сравнивает</h3>
      <p>Собирает данные с нескольких сайтов в таблицу. У каждого факта — цитата со страницы, расчёты делает код, а не модель.</p>
    </article>
    <article class="feature">
      <span class="feature__icon">${ICONS.hand}</span>
      <h3>Действует за вас</h3>
      <p>Заполняет формы и работает в личных кабинетах — в вашем браузере, с вашими входами. Необратимые шаги — только после проверки и вашего «да».</p>
    </article>
    <article class="feature">
      <span class="feature__icon">${ICONS.repeat}</span>
      <h3>Повторяет по шаблону</h3>
      <p>Частые задания сохраняются как шаблоны и запускаются по расписанию. Ассистент помнит прошлые разговоры и результаты.</p>
    </article>
  </div>
</section>`;

function guest(): string {
  return `<section class="hero wrap">
  <div class="hero__text">
    <p class="eyebrow">Расширение для Chrome и Яндекс Браузера</p>
    <h1>AI-агент, который работает в&nbsp;вашем браузере</h1>
    <p class="lead">Опишите задачу в боковой панели — агент найдёт и сравнит данные, заполнит формы и выполнит действия в ваших аккаунтах. Важные шаги он сначала покажет вам.</p>
    <div class="cta">
      <a class="btn btn--yandex" href="/auth/yandex">${YANDEX_MARK}Войти с Яндекс ID</a>
      <span class="cta__note">Ранний доступ открыт для всех зарегистрированных</span>
    </div>
  </div>
  ${PANEL}
</section>
${FEATURES}
<section class="how wrap" aria-labelledby="how-title">
  <h2 id="how-title" class="section-title">Как начать</h2>
  <ol class="steps">
    <li><b>Войдите</b> через Яндекс ID — пароль не нужен.</li>
    <li><b>Скачайте</b> расширение и установите его в браузер.</li>
    <li><b>Подключите</b>: вставьте в боковую панель адрес сервера и свой токен.</li>
  </ol>
</section>`;
}

function cabinet(user: UserRecord, access: AccessState, goldfishUrl: string): string {
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
    <p class="lead">Два шага — и агент работает в вашем браузере.</p>
  </div>
</section>
<section class="cabinet wrap" aria-label="Установка и подключение">
  <article class="card">
    <h2><span class="num">1</span>Установите расширение</h2>
    <a class="btn btn--accent" href="/download">Скачать расширение</a>
    <ol class="list">
      <li>Распакуйте zip в постоянную папку — не удаляйте её после установки.</li>
      <li>Откройте <code>chrome://extensions</code> <button class="link" type="button" data-copy="chrome://extensions">скопировать</button> и включите «Режим разработчика».</li>
      <li>Нажмите «Загрузить распакованное» и выберите эту папку.</li>
      <li>Закрепите значок Goldfish на панели и нажмите на него — откроется боковая панель.</li>
    </ol>
    <p class="hint">Нужен Chrome 116+ или другой браузер на Chromium: Яндекс Браузер, Edge.</p>
  </article>
  <article class="card">
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
    <p class="hint">Нажмите «Сохранить» — индикатор «Подключено» значит, что можно писать задачи.</p>
  </article>
</section>`;
}

export function renderPage(s: PageState): string {
  const main = s.user && s.access ? cabinet(s.user, s.access, s.goldfishUrl) + FEATURES : guest();
  return layout(
    s,
    'Goldfish — AI-агент в браузере',
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
