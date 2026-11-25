POSTGRES_HOST ?= localhost
POSTGRES_PORT ?= 5432
POSTGRES_USER ?= avdb
POSTGRES_PASSWORD ?= avdb
POSTGRES_DB ?= avdb

NODE ?= node
NPM ?= npm
PYTHON ?= .venv/bin/python
E2E_BASE_URL := http://127.0.0.1:$(E2E_PORT)
E2E_PORT := 5010
E2E_POSTGRES_PORT ?= 5433

.PHONY: up up-recreate build typecheck db db-session import-sites import-fake-records sso-client-secret \
	e2e-db e2e-db-session e2e-db-down e2e-server e2e-test e2e-test-ts up-auth

up:
	docker compose up --build

# Hard-reset of the docker layers
up-recreate:
	docker compose build --no-cache && docker compose up --force-recreate

build:
	$(NPM) run build

typecheck:
	$(NPM) run typecheck

# Initialize the database schema from inside the web container
db:
	docker compose exec web node dist/src/init_db.js

db-session:
	docker compose exec -it -e PGPASSWORD=$(POSTGRES_PASSWORD) \
	  db psql \
	  -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) -d $(POSTGRES_DB)

# Import buildings CSV into sites
import-sites:
	docker compose exec -T -w / -e PGPASSWORD=$(POSTGRES_PASSWORD) \
	  db psql \
	  -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) -d $(POSTGRES_DB) \
	  -v ON_ERROR_STOP=1 \
	  -f /data/import_sites.sql

# Import fake organizations, contacts, and systems for development; run import-sites first
import-fake-records:
	docker compose exec -T -w / -e PGPASSWORD=$(POSTGRES_PASSWORD) \
	  db psql \
	  -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) -d $(POSTGRES_DB) \
	  -v ON_ERROR_STOP=1 \
	  -f /data/import_fake_records.sql

# USE FOR LOCAL DEV ONLY, NOT PRODUCTION
sso-client-secret:
	@$(NODE) -e "console.log('SHIBBOLETH_CLIENT_SECRET=' + require('node:crypto').randomBytes(32).toString('base64url'))"

# Create a fresh test db (no persistent volume) parallel to dev db
e2e-db: build
	DB_CONTAINER_NAME="avdb-postgres-test" \
	DB_HOST_PORT=$(E2E_POSTGRES_PORT) \
	docker compose -p avdb-e2e -f docker-compose.yml -f docker-compose.e2e.yml up db -d --wait && \
	DATABASE_URL=postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(E2E_POSTGRES_PORT)/$(POSTGRES_DB) \
	node dist/src/init_db.js

e2e-db-session:
	docker compose -p avdb-e2e exec -it -e PGPASSWORD=$(POSTGRES_PASSWORD) \
	  db psql \
	  -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) -d $(POSTGRES_DB)

e2e-db-down:
	docker compose -p avdb-e2e down

# Start the dev (auth bypass) app server for e2e runs
e2e-server: build
	SECRET_KEY=dev-secret-key \
	DATABASE_URL=postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(E2E_POSTGRES_PORT)/$(POSTGRES_DB) \
	PORT=$(E2E_PORT) \
	node dist/dev/app_dev.js

# Run the Pytest-Playwright browser tests (ported from the Flask app).
e2e-test:
	@set -e; \
	if ! lsof -iTCP:$(E2E_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "No server found on $(E2E_BASE_URL). Start it first with: make e2e-server" >&2; \
		exit 1; \
	fi; \
	E2E_BASE_URL=$(E2E_BASE_URL) $(PYTHON) -m pytest -q tests/e2e

# Run the Playwright TypeScript e2e tests.
e2e-test-ts:
	@set -e; \
	if ! lsof -iTCP:$(E2E_PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "No server found on $(E2E_BASE_URL). Start it first with: make e2e-server" >&2; \
		exit 1; \
	fi; \
	E2E_PORT=$(E2E_PORT) npx playwright test

# Uses production Dockerfile and .env to test Shibboleth + AuthMan integrations.
# Runs in the same Compose project and reuses the existing development database.
# Inherits environment from docker-compose.yml (SECRET_KEY, DATABASE_URL)
up-auth:
	docker compose -f docker-compose.yml -f docker-compose.auth.yml up --build
