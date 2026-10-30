# Tempo backend

Developer reference for the Tempo Telegram assistant. For an overview, see the [root README](../README.md).

## Stack

| Concern | Choice |
| --- | --- |
| Runtime / package manager / test runner | [Bun](https://bun.sh) 1.3+ |
| HTTP framework | [Hono](https://hono.dev) on `Bun.serve` |
| Validation | [Zod](https://zod.dev) 4 (+ `@hono/zod-validator`) |
| ORM | [TypeORM](https://typeorm.io) + `pg` (Postgres) |
| Dependency injection | [tsyringe](https://github.com/microsoft/tsyringe) + `reflect-metadata` |
| Logging | [pino](https://getpino.io) (+ `pino-pretty` in dev) |
| Email | `nodemailer` + `handlebars` + `html-to-text` |
| Lint / format | [Biome](https://biomejs.dev) |
| Git hooks | [husky](https://typicode.github.io/husky) |

No build step: `.ts` files run directly under Bun in both dev and production.

## Architecture

Module-per-feature. `src/assistant/` owns the chat flow (`commands/`, `services/`, `tools/`, `prompts/`,
`entities/`, `repositories/`, `schemas/`, `tests/`); shared infrastructure lives under `src/common/`, including the
chat provider, LangChain and Google integrations in `src/common/integrations/`.

```
Telegram -> AssistantService -> CommandRouter (slash commands)
                             -> LangchainService agent loop -> tool providers (Gmail, reminders) -> Google APIs
```

- **Commands** implement `CommandHandler` and are registered under `COMMAND_HANDLERS` in `bootstrap.ts`.
- **Tools** come from `ToolProvider`s registered under `TOOL_PROVIDERS`; they are built per message with the current
  user, time, timezone and an outbox for extra messages sent after the reply.
- **Repositories** extend a thin TypeORM `BaseRepository`; **entities** extend `BaseEntity` (`id`, `createdAt`,
  `updatedAt`).
- The only HTTP routes are `GET /health` and the Google OAuth callback.

## Getting started

```bash
bun install
cp .env.example .env   # then fill in the values
bun run migration migrate   # once, after configuring .env
bun run dev                 # HTTP + Telegram long polling
```

Required `.env` on the server: `OPENAI_API_KEY`, `DB_*`.

Telegram: set `TELEGRAM_BOT_TOKEN`. Insert an allowlisted person as a `users` row with `telegram_id` equal to their numeric Telegram user id (string, never `""`) and `is_allowed = true`. Unknown senders get one `This bot is private.` reply, then silence. If the token is empty, `/health` still works; polling does not start.

The server starts on `PORT` (default `4000`). Health check: `GET /health`.

## Google account

Each allowlisted user can connect one Google account (Gmail and Calendar scopes) by sending `/connect` to the bot.
`GoogleAuthService.getClient(user, scopes)` returns an auto-refreshing `OAuth2Client`; the refresh token is stored
AES-256-GCM encrypted in `google_credentials`. The bot boots and works without any of this configured.

### One-time setup

1. Google Cloud project: enable the Gmail API and the Google Calendar API.
2. OAuth consent screen: user type External; add yourself as a test user.
3. Credentials > OAuth client ID > application type **Web application**. Add the authorized redirect URI
   `https://<host>/oauth/google/callback` for each environment (local tunnel and production). Put the client ID and
   secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Set `PUBLIC_BASE_URL` in `.env` to the public HTTPS origin of this server, without a trailing slash (for example
   `https://tempo.example.com`). Google redirects the browser to `${PUBLIC_BASE_URL}/oauth/google/callback`.
5. Generate the encryption key and put it in `.env` as `TOKEN_ENCRYPTION_KEY`:

   ```bash
   openssl rand -base64 32
   ```

   Losing or changing this key makes stored credentials unreadable; every user must then reconnect.
6. Run the migrations (`bun run migration migrate`) so `google_credentials` and `oauth_pending_consents` exist.

For local development, expose the server with a tunnel that has a stable domain, for example
`ngrok http --url=<static-domain> 4000`, and use that domain in `PUBLIC_BASE_URL` and the redirect URI. ngrok's free
plan shows an interstitial page on first visit; click through it.

### Publishing status

While the consent screen is in "Testing", Google expires the grant and its refresh token 7 days after consent for any
scope beyond `openid`/`email`, so expect to reconnect weekly. Switching to "In production" (no verification needed
under 100 users) removes the expiry but shows an "unverified app" warning at consent.

### Connect

Send `/connect` to the bot in Telegram, tap the link (valid 10 minutes), and approve all scopes. The bot then confirms
in the chat with the connected email, and lists any scope that was not granted. Sending `/connect` again replaces the
stored token. Users who connected with the old Desktop app client must reconnect after switching to the Web client.

If Google revokes or expires the grant, the stored credential is deleted. Tool calls then fail with a message that
says to send `/connect`; that error is passed to the model, which usually relays it to the user.

## Gmail

Once Google is connected, the assistant can search and read your email and create drafts (new emails or replies in the
right thread). It cannot send anything on its own: after drafting, the bot shows a preview of the actual draft
(recipients, body, and a warning for first-time recipients), and the email is sent only when you send `/send`. Only the
draft from the last preview can be sent, for one hour; a new draft replaces the previous one. Email content is passed
to the model as untrusted data.

## Reminders

Ask the assistant to remind you of something ("remind me tomorrow at 9 to call the bank", "every weekday at 8:30")
and it creates a Google Calendar event on your primary calendar with a popup at that time. Google delivers the
notification, so Tempo runs no scheduler. It can also list and cancel the reminders it created (cancelling a repeating
one deletes the whole series). Repeats: daily, weekdays, weekly, monthly (day 1-28).

Reminders are tagged (`extendedProperties.private.tempo = reminder`); the bot only lists and cancels tagged events, so it
cannot touch your meetings. Events have no attendees, so nobody else is invited or notified. Times use your timezone:
set it with `/timezone Europe/Paris` (IANA name; `/timezone` alone shows it and the current local time). It defaults to
UTC, and the confirmation message names the zone it used.

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Run with hot reload (`bun --watch`) |
| `bun run start` | Run once |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | Biome check |
| `bun run lint:fix` | Biome check + autofix |
| `bun run format` | Biome format |
| `bun test` | Run the test suite (`bun test src/<module>` for one module) |
| `bun run migration <command>` | Database migrations (see below) |

## Migrations

Migrations live in `src/migrations/` and are registered through `src/migrations/index.ts`.
Entity classes are collected in `createDataSource()` from each module's `entities/` barrel.
A running local Postgres matching your `.env` is required to generate or run migrations.

| Command | Description |
| --- | --- |
| `bun run migration status` | List applied and pending migrations |
| `bun run migration generate <name>` | Generate a migration from entity diffs (updates `index.ts`) |
| `bun run migration create <name>` | Create an empty migration file (updates `index.ts`) |
| `bun run migration migrate` | Apply all pending migrations |
| `bun run migration rollback` | Revert the last applied migration |

Migration names are used as-is (e.g. `create-users-table` becomes `src/migrations/<timestamp>-create-users-table.ts`).
`generate` and `create` delegate to the TypeORM CLI via Bun; all other commands use the app's
`DataSource` and logger directly.

```bash
bun run migration status
bun run migration generate initial-migration
bun run migration migrate
bun run migration rollback
```

## Testing

Tests live per-module under `tests/`, mirroring the production subfolders (`commands/`, `services/`, `tools/`,
`integrations/`, ...). Bun discovers `*.test.ts` automatically; Google and Telegram APIs are replaced with fakes, so
no network or database is needed.
