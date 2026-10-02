# Goldfish — сайт

Одностраничник Goldfish: коротко о продукте, вход через Яндекс ID, скачивание расширения и выдача
доступа к серверу агента. Позже через этот сайт будут оформляться подписки; сейчас доступ есть у
каждого, кто вошёл.

| Гость                        | После входа                  |
| ---------------------------- | ---------------------------- |
| ![Лендинг](docs/landing.png) | ![Кабинет](docs/cabinet.png) |

## Как это устроено

```
Пользователь ──► Сайт (этот репозиторий) ──── API оператора ────► Сервер Goldfish
   │  вход через Яндекс ID                    пользователь, токен
   │  скачивает zip, получает токен
   │
   └──► Расширение ──── WebSocket /ws + токен ────► Сервер Goldfish
```

- Сайт хранит своих пользователей (Яндекс ID, имя, e-mail) и сессии в PostgreSQL.
- По кнопке «Получить токен» сайт через API оператора Goldfish заводит пользователя
  `yandex:<id Яндекса>` в клиенте «Сайт» и выпускает токен устройства. Токен показывается один раз и
  на сайте не хранится, только его id; новый токен отзывает предыдущий.
- Расширение работает напрямую с сервером Goldfish: в работе агента сайт не участвует и может быть
  недоступен.
- Zip расширения сайт берёт у сервера Goldfish (`/extension/download`, он есть в его Docker-образе)
  или из своего файла `EXTENSION_ZIP`.

Код сервера и расширения — в репозитории [goldfish](https://github.com/Bulat89/goldfish).

## Подписки — куда подключать

Доступ решает одна функция — `accessOf(user)` в [`src/access.ts`](src/access.ts); сейчас она
пускает всех. Когда появятся тарифы:

1. Добавить в пользователя план и оплаченный период — новой миграцией в
   [`src/store/migrations.ts`](src/store/migrations.ts) (старые миграции не менять).
2. Считать доступ в `accessOf`: без доступа сайт не выдаёт токен и не отдаёт zip, а в кабинете
   показывает причину.
3. При оплате и окончании периода отправлять состояние на сервер Goldfish:
   `POST /admin/users/<clientId>/yandex:<id>/subscription {"action":"activate"|"suspend","until":…}`.
   Сервер сам отключит расширение и остановит задачи, а после продления всё продолжится с того же
   места — диалоги и память сохраняются.

## Приложение Яндекс ID

1. Создайте приложение на [oauth.yandex.ru](https://oauth.yandex.ru/client/new), платформа —
   «Веб-сервисы».
2. Redirect URI: `https://<домен сайта>/auth/yandex/callback`. Для локального запуска добавьте
   `http://localhost:3000/auth/yandex/callback`.
3. Доступы: логин, имя и фамилия (`login:info`), адрес электронной почты (`login:email`), портрет
   (`login:avatar`).
4. ClientID → `YANDEX_CLIENT_ID`, Client secret → `YANDEX_CLIENT_SECRET`.

## Запуск локально

Нужен Node.js 22 и запущенный сервер Goldfish (его README, раздел «Быстрый старт»).

```bash
npm ci
PUBLIC_URL=http://localhost:3000 \
YANDEX_CLIENT_ID=… YANDEX_CLIENT_SECRET=… \
GOLDFISH_URL=http://localhost:8080 GOLDFISH_ADMIN_TOKEN=<ADMIN_TOKEN сервера Goldfish> \
npm run dev
```

Без `DATABASE_URL` пользователи и сессии живут в памяти и пропадают при перезапуске.

## Развёртывание в Timeweb Cloud

### Вариант А — App Platform, Docker Compose

1. App Platform → новое приложение из этого репозитория, тип «Docker Compose»
   (`docker-compose.yml` в корне). Сайт слушает порт `3000`, проверка состояния — `/healthz`.
2. В разделе переменных приложения задайте: `PUBLIC_URL`, `YANDEX_CLIENT_ID`,
   `YANDEX_CLIENT_SECRET`, `GOLDFISH_URL`, `GOLDFISH_ADMIN_TOKEN` (остальные — по желанию, список
   ниже). Compose подставляет их в контейнер сам — файл `.env` в репозитории не нужен и не должен
   там лежать.
3. База: без `DATABASE_URL` сайт использует PostgreSQL из того же compose. Надёжнее управляемая база
   Timeweb (резервные копии, переживает пересборку) — тогда задайте её строку в `DATABASE_URL`.
   Таблицы сайт создаёт сам при старте.
4. Привяжите домен. `PUBLIC_URL` — этот адрес с `https://`, он же в Redirect URI приложения Яндекс ID.

Если сайт не стартует, в логах приложения будет `Invalid configuration` со списком незаданных
переменных.

### Вариант Б — App Platform, Dockerfile

То же, но тип «Dockerfile» (порт `3000`, `/healthz`): контейнер только с сайтом, база — управляемая
PostgreSQL 16 в `DATABASE_URL` (обязательна), плюс `NODE_ENV=production`.

### Вариант В — облачный сервер с Docker

```bash
git clone https://github.com/Bulat89/site_ai_agent.git && cd site_ai_agent
cp .env.example .env     # заполнить: PUBLIC_URL, YANDEX_*, GOLDFISH_*, SITE_DOMAIN
docker compose -f docker-compose.yml -f deploy/caddy.yml up -d   # + Caddy с сертификатом Let's Encrypt
```

- A-запись домена (`SITE_DOMAIN`) — на IP сервера, порты 80 и 443 открыты. С Caddy сайт слушает
  только `127.0.0.1:3000`.
- Уже есть nginx или другой прокси с TLS — просто `docker compose up -d` и проксируйте на порт
  `3000`; закройте этот порт снаружи файрволом.
- Обновление: `git pull && docker compose up -d --build`.
- Резервная копия: `docker compose exec postgres pg_dump -U site site > site.sql`.

### Связь с сервером Goldfish

- `GOLDFISH_ADMIN_TOKEN` — это `ADMIN_TOKEN` сервера Goldfish, он даёт полный доступ к серверу:
  храните его как пароль. Если `/admin` закрыт от интернета (так советует документация Goldfish),
  разрешите адрес сайта или укажите внутренний адрес в `GOLDFISH_ADMIN_URL`.
- Пользователи сайта видны в панели оператора Goldfish (`/admin/ui`) в клиенте «Сайт» — с именем и
  e-mail. Лимиты и подписку пока можно менять там.
- `/extension/download` на сервере Goldfish открыт без входа. Чтобы zip был доступен только после
  регистрации, закройте этот путь на прокси Goldfish и положите zip на сайт (`EXTENSION_ZIP`).

## Переменные окружения

| Переменная                  | По умолчанию              | Что это                                                                             |
| --------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `PUBLIC_URL`                | —                         | адрес сайта; из него строится Redirect URI, по `https` включаются защищённые cookie |
| `DATABASE_URL`              | — (в памяти)              | PostgreSQL; в продакшене обязателен                                                 |
| `YANDEX_CLIENT_ID`          | —                         | ClientID приложения Яндекс ID                                                       |
| `YANDEX_CLIENT_SECRET`      | —                         | Client secret                                                                       |
| `GOLDFISH_URL`              | —                         | сервер Goldfish, как его вводят в расширении                                        |
| `GOLDFISH_ADMIN_URL`        | `GOLDFISH_URL`            | адрес API оператора, если он другой (внутренняя сеть)                               |
| `GOLDFISH_ADMIN_TOKEN`      | —                         | `ADMIN_TOKEN` сервера Goldfish                                                      |
| `GOLDFISH_CLIENT_ID`        | —                         | клиент Goldfish для пользователей сайта                                             |
| `GOLDFISH_CLIENT_NAME`      | `Сайт`                    | без `GOLDFISH_CLIENT_ID` клиент ищется по имени или создаётся                       |
| `EXTENSION_ZIP`             | —                         | свой zip расширения вместо пакета с сервера Goldfish                                |
| `SESSION_DAYS`              | `30`                      | сколько дней действует вход                                                         |
| `PRIVACY_URL`               | —                         | политика обработки персональных данных (ссылка в подвале)                           |
| `SUPPORT_EMAIL`             | —                         | адрес поддержки (ссылка в подвале)                                                  |
| `PORT`, `HOST`, `LOG_LEVEL` | `3000`, `0.0.0.0`, `info` |                                                                                     |

## Маршруты

| Метод | Путь                    |                                                       |
| ----- | ----------------------- | ----------------------------------------------------- |
| GET   | `/`                     | лендинг для гостя, кабинет после входа                |
| GET   | `/auth/yandex`          | переход на Яндекс ID                                  |
| GET   | `/auth/yandex/callback` | возврат с Яндекс ID, начало сессии                    |
| POST  | `/logout`               | выход                                                 |
| GET   | `/download`             | zip расширения (только после входа)                   |
| POST  | `/api/token`            | новый токен устройства `{token, serverUrl, issuedAt}` |
| GET   | `/healthz`, `/readyz`   | живость и готовность (с проверкой базы)               |

## Безопасность

- Вход — authorization code с PKCE и `state`. Токен Яндекса используется один раз, чтобы прочитать
  профиль, и не сохраняется.
- Cookie — `HttpOnly`, `SameSite=Lax`, по `https` с префиксом `__Host-` (поддомен не подложит свою
  сессию). Сессии хранятся в базе хешем.
- Изменяющие запросы (`/api/token`, `/logout`) принимаются только со страниц самого сайта (проверка
  `Origin`); CSP без inline-скриптов, страница не встраивается во фреймы.
- Персональные данные (имя, e-mail) хранятся в PostgreSQL — держите базу в России (152-ФЗ) и укажите
  `PRIVACY_URL`.
- Выдача токенов сериализуется в памяти процесса — запускайте одну реплику.

## Проверки

```bash
npm run typecheck
npm test                                                     # Яндекс ID и сервер Goldfish — фейковые
TEST_DATABASE_URL=postgres://… npm test                      # + хранилище на PostgreSQL
npm run format:check
```
