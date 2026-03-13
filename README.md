# homelab-app-starter

Opinionated TanStack Start starter with:

- React 19 + Vite
- Tailwind CSS
- Postgres for persistence
- Drizzle ORM + Drizzle Kit for schema and migrations
- Local development optimized for `npm run dev` on the host and Postgres in Docker

## Core technologies

- TanStack Start: https://tanstack.com/start
- TanStack Router: https://tanstack.com/router
- React: https://react.dev/
- Vite: https://vite.dev/
- Tailwind CSS: https://tailwindcss.com/docs
- shadcn/ui: https://ui.shadcn.com/docs
- Drizzle ORM: https://orm.drizzle.team/docs/overview
- Drizzle Kit: https://orm.drizzle.team/docs/drizzle-kit-overview
- PostgreSQL: https://www.postgresql.org/docs/
- Docker Compose: https://docs.docker.com/compose/

## Import paths

This template is configured to support absolute imports from `src` through the `#/...` alias.

Examples:

```ts
import { cn } from '#/lib/utils'
import { getDb } from '#/db/client'
import Header from '#/components/Header'
```

That alias is wired through:

- `tsconfig.json` for TypeScript path resolution
- `vite.config.ts` through `vite-tsconfig-paths`
- `package.json` `imports` so Node-side code can understand the same `#` convention where applicable

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create your local environment file:

```bash
cp .env.example .env
```

3. Start Postgres:

```bash
npm run db:up
```

4. Apply the starter migration:

```bash
npm run db:migrate
```

5. Start the app:

```bash
npm run dev
```

If you want one command for the local dev workflow after creating `.env`, use:

```bash
npm run dev:local
```

The app runs on `http://localhost:3000`. Postgres is exposed on `localhost:5432`.

## Environment variables

The base template expects:

- `DATABASE_URL`: Postgres connection string used by app code and Drizzle
- `HOST`: server host for the production runtime
- `PORT`: server port for the production runtime
- `NODE_ENV`: runtime mode

`.env.example` is documentation and a starter template for humans. The application does not read `.env.example` directly.

For local development:

1. Copy `.env.example` to `.env`
2. Change any values you need
3. Run the app with that local `.env`

For production:

- set real environment variables in your deployment platform or container definition
- do not rely on `.env.example`

In other words, the step-by-step instructions in this README are documentation for how to prepare your environment. The runtime code uses `.env` or real environment variables, not `.env.example`.

For containerized deployments, values set under a Compose service `environment:` block are injected into the container and become available to Node through `process.env`.

### App-specific environment variables

Do not bake third-party API keys directly into the starter contract. When an app needs them:

1. Add them to `.env.example`
2. Document them in this README
3. Pass them to your deployment platform
4. Keep `compose.yaml` focused on shared local infrastructure unless a service truly belongs in local Docker

## Database workflow

Starter database files live here:

- `src/db/client.ts`: lazy database client creation
- `src/db/schema/`: Drizzle schema definitions
- `drizzle/`: generated SQL migrations and metadata
- `drizzle.config.ts`: Drizzle Kit configuration

### How Drizzle works in this repo

The TypeScript schema files are the source of truth.

When you want to add or change tables:

1. Edit or add schema files in `src/db/schema/`
2. Run `npm run db:generate`
3. Run `npm run db:migrate`

What each step does:

- `db:generate`: reads your schema definitions and creates a SQL migration in `drizzle/`
- `db:migrate`: applies pending SQL migrations to the database in `DATABASE_URL`

This means you usually do not write SQL migrations by hand. You define tables in TypeScript, let Drizzle generate the SQL, then apply that migration to your database.

Useful commands:

```bash
npm run db:up
npm run db:down
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:studio
```

Recommended workflow after changing schema files:

```bash
npm run db:generate
npm run db:migrate
```

Example local flow for a new table:

```bash
npm run db:up
cp .env.example .env

# edit src/db/schema/*
npm run db:generate
npm run db:migrate
npm run dev
```

`npm run db:push` is also available, but it is best treated as a fast local shortcut. For normal project work, prefer `db:generate` plus `db:migrate` so your migration history is committed and reviewable.

### Avoiding manual production migrations

If you are deploying this app as a container, the recommended pattern is a one-shot migration service or job that runs before the web app starts.

This repo includes a deployment example in `compose.deploy.example.yaml` that uses three services:

- `db`: the Postgres database
- `migrate`: a one-time container that runs `npm run db:migrate`
- `app`: the web app, configured to wait for the migration service to finish successfully

In that setup, you avoid having to manually shell into a running app container just to initialize the schema.

Typical deployment flow:

1. Start or create the database service
2. Run the one-shot migration job
3. Start the app service only after migrations succeed

The example file uses Docker Compose conditions to express that ordering. If your deployment platform supports one-shot jobs, init containers, or pre-start hooks, use the same idea there: run `npm run db:migrate` with the production `DATABASE_URL` before starting the web process.

If your platform cannot express a dedicated migration job, keep this as an explicit documented deployment step:

```bash
docker run --rm \
  -e DATABASE_URL=postgres://postgres:change-me@db:5432/app \
  ghcr.io/replace-me/homelab-app-starter:latest \
  npm run db:migrate
```

Then start the normal app container after that job succeeds.

## Testing

This template currently uses `Vitest`.

Run the current test suite with:

```bash
npm run test
```

### What the current test covers

Right now the template includes a small smoke test in `src/db/client.test.ts`.

That test checks:

- `DATABASE_URL` can be read from the expected environment contract
- the DB helper throws when `DATABASE_URL` is missing
- a Postgres pool can be created without connecting eagerly

This is useful as a starter sanity check, but it is not a full integration test.

### What the current test does not cover yet

The template does not yet include:

- a dedicated test database such as `app_test`
- a script that runs migrations specifically for tests
- seed helpers or test fixtures
- tests that execute real queries against a running Postgres instance
- browser end-to-end tests with Playwright

So today, `npm run test` verifies the test runner setup and the database client contract, but it does not prove that your application can successfully talk to a live Postgres database.

### Recommended future integration-testing flow

The recommended next step is to keep using `Vitest`, but point it at a real Postgres test database that is separate from your local development database.

A common future setup would look like this:

1. Start Postgres for tests
2. Use a separate test database such as `app_test`
3. Apply migrations to that test database
4. Seed only the data needed for a test or test suite
5. Run `Vitest` against that isolated database
6. Clean up the database state between tests

Example shape of that future workflow:

```bash
npm run db:up
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/app_test npm run db:migrate
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/app_test npm run test
```

In that kind of setup:

- `Vitest` is used for integration tests around database code, server functions, loaders, and domain logic
- each test or suite inserts only the records it needs
- the database is reset between tests so runs stay isolated and repeatable

This README guidance is describing a recommended future testing setup. It is not fully implemented in this template yet.

### When Playwright would fit

If you later want browser-level end-to-end coverage, `Playwright` would sit above this integration-testing layer.

That usually comes after you already have:

- reliable unit tests
- reliable `Vitest` integration tests against a real Postgres database

At that point, `Playwright` is best used for user journeys such as logging in, submitting forms, or navigating through multi-step flows in a real browser.

## Production runtime

Build the app with:

```bash
npm run build
```

Start the production server with:

```bash
npm run start
```

The included `Dockerfile` builds the app and runs the same production entrypoint. This repo does not treat full Dockerized local development as the default path.
