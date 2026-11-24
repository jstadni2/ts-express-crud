# AV Installation Database (AVDB) — TypeScript + Express.js

A TypeScript + Express.js + Drizzle ORM port of the AV Installation Database
app originally written with Flask / SQLAlchemy. It preserves the application's
feature set, database schema, authentication/authorization model, Docker
infrastructure, and end-to-end test coverage.

The original Python/Flask implementation lives in
[`../flask-crud-auth-rbac`](../flask-crud-auth-rbac).

## Architecture

- `src/`: Production application code (Express.js).
  - `src/app.ts`: application factory — middleware, authentication gate, routes,
    helpers.
  - `src/models.ts`: Drizzle ORM schema (mirrors the Flask models).
  - `src/init_db.ts`: database schema creation (mirrors Flask `init-db`).
  - `src/db.ts`: node-postgres pool + Drizzle connection.
  - `src/oidc.ts`: Illinois Shibboleth OIDC auth backend.
  - `src/views/`: EJS templates (migrated from Jinja2).
  - `src/static/`: shared sort/filter table JS + CSS.
- `dev/`: Development-only code (auth bypass + developer role switching),
  mirroring `flask-crud-auth-rbac/dev`.
- `tests/e2e/`: Pytest-Playwright end-to-end tests (ported from the Flask repo).
- `tests/ts-e2e/`: Playwright TypeScript end-to-end tests (the rewritten suite).
- `Dockerfile`: Production image recipe (Node.js runtime — no Gunicorn).
- `docker-compose.yml`: `web` (Node.js) + `db` (PostgreSQL) services.
- `data/`: Databases seed/import SQL + CSV data.

## Authentication and Authorization

- All application routes require a logged-in user session.
- Login uses Illinois Shibboleth OpenID Connect at `https://shibboleth.illinois.edu`.
- Role access:
  - **Viewer**: read-only access (list and detail views).
  - **Maintainer**: full CRUD on systems, sites, organizations, and contacts.
  - **Admin**: includes all Maintainer access.

Required environment variables for the OIDC flow:

- `SHIBBOLETH_CLIENT_ID`
- `SHIBBOLETH_CLIENT_SECRET`
- `AUTHMAN_ROLES`

See [.env.example](.env.example).

## Requirements

- Node.js (the project pins `typescript@7.0.2`, `express@5.3.0`,
  `drizzle-orm@0.45.4`, `pg@8.23.1`).
- Docker + Docker Compose (for the database and containerized server).
- (Optional) Python 3 + `pytest-playwright` for the ported Python e2e suite, or
  Node `@playwright/test` for the TypeScript e2e suite.

Install dependencies:

```sh
npm install
npm run build
```

## Development (Dockerized web server with authentication bypass)

The dev configuration uses the `Dockerfile.dev` image with an auth bypass and
developer role switching (`/dev/role`).

```sh
docker compose up --build
```

Initialize the database schema:

```sh
make db
```

Import seed data (optional):

```sh
make import-sites
make import-fake-records
```

Open `http://127.0.0.1/` and visit `http://127.0.0.1/dev/role` to switch roles.

## Local Node server (without Docker)

Prerequisites: a running PostgreSQL instance (e.g. via `make e2e-db` or a local
Postgres).

```sh
npm run build
DATABASE_URL=postgresql://avdb:avdb@localhost:5433/avdb node dist/src/init_db.js
DATABASE_URL=postgresql://avdb:avdb@localhost:5433/avdb SECRET_KEY=dev-secret-key \
  PORT=5010 node dist/dev/app_dev.js
```

## End-to-End Testing

### TypeScript suite (Playwright)

```sh
make e2e-db       # fresh isolated test database on port 5433
make e2e-server   # start the dev server on port 5010 (in another terminal)
make e2e-test-ts  # run `npx playwright test` (tests/ts-e2e)
```

or manually:

```sh
DB_CONTAINER_NAME="avdb-postgres-test" DB_HOST_PORT=5433 \
  docker compose -p avdb-e2e -f docker-compose.yml -f docker-compose.e2e.yml up db -d --wait
DATABASE_URL=postgresql://avdb:avdb@localhost:5433/avdb node dist/src/init_db.js
DATABASE_URL=postgresql://avdb:avdb@localhost:5433/avdb SECRET_KEY=dev-secret-key \
  PORT=5010 node dist/dev/app_dev.js
npx playwright test
```

### Ported Pytest-Playwright suite (Python)

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-test.txt
.venv/bin/playwright install chromium

make e2e-db
make e2e-server
make e2e-test
```

Tear down the test database when finished:

```sh
make e2e-db-down
```

## Data Model

The Drizzle ORM schema mirrors the original Flask models. See the Mermaid ERD
in [`../flask-crud-auth-rbac/README.md`](../flask-crud-auth-rbac/README.md) for
the relationships; the table/column layout is identical:

- `organizations`
- `contacts`
- `sites`
- `systems`
- `site_contacts` (junction)
- `system_contacts` (junction)

PostgreSQL native enums store the human-facing values (e.g. `Owned`,
`Internal`, `Planned`, `Installed`).