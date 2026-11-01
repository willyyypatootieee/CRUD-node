# TaskFlow · A3: Containerize your stack

Task CRUD API with Express, JavaScript ES Modules, parameterized PostgreSQL queries, Swagger UI, and a lightweight Docker Compose stack. This repository continues the A1 memory → A2 SQLite → A3 PostgreSQL storage progression.

## Start the whole stack

Requires Docker Engine with Docker Compose. Node.js is only needed for local development and test commands.

```bash
cp .env.example .env
# Edit .env: change POSTGRES_PASSWORD and the password in DATABASE_URL to match.
docker compose up --build
```

Subsequent starts: **`docker compose up`**. Open <http://localhost:3000/docs> for Swagger UI, <http://localhost:3000/health> for health, or <http://localhost:3000/tasks> for tasks.

`.env` is gitignored and excluded from Docker builds; `.env.example` is committed. Never commit real credentials. Use a URL-encoded password in `DATABASE_URL` if it contains reserved URL characters. The database hostname is `db` inside Compose, not `localhost`. Compose interpolates its environment from `.env`; the app receives only its connection string and runtime settings.

Postgres is deliberately **not published to the host**. The API binds only to host loopback. Access SQL through:

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Inside psql: `\dt`, then `SELECT * FROM tasks ORDER BY id;`, then `\q`.

## Architecture and the honest storage-swap boundary

```mermaid
flowchart LR
    Client[HTTP client / Swagger UI] --> Routes[Unchanged Express routes]
    Routes --> Controller[Async TaskController]
    Controller --> Service[TaskService: validation and rules]
    Service --> Repository[PostgresTaskRepository]
    Repository --> Pool[pg pool: max 5 connections]
    Pool --> DB[(Postgres 17 Alpine)]
    DB --> Volume[Named volume: taskdata]
```

Repository methods retain the A2 interface: `findAll`, `findById`, `create`, `update`, `delete`, `getStatistics`, and `reset`. All Postgres queries live in `PostgresTaskRepository.js`; connection management lives in `config/postgres.js`. SQL values use `$1` parameters. Dynamic update columns are restricted to a hardcoded whitelist.

**Routes are unchanged. Services are not literally unchanged.** A2 used synchronous `better-sqlite3`; `pg` returns promises. Controller methods now await service results. The service's lookup, update, and delete paths now await repository calls, and update/delete detect concurrent disappearance. Validation and the API contracts remain intact. Claiming a one-file swap would be inaccurate without an asynchronous repository contract in A2 first.

`server.js` requires Postgres; it does not silently fall back to SQLite. `createApp({ repository })` supports dependency injection. The A2 SQLite implementation and Python exercises remain available for regression testing; SQLite is an optional npm dependency omitted from the production image and loaded only when that fallback is explicitly used by tests/application factories.

## Small, constrained containers

- `node:24-alpine` and `postgres:17-alpine`; no compiler or native SQLite dependency in the runtime image.
- Multi-stage build, `npm ci --omit=dev --omit=optional --ignore-scripts`, and package-first copying for cache reuse.
- `.dockerignore` excludes Git, secrets, local databases, tests, screenshots, Python, and host dependencies.
- App runs as the non-root `node` user with a read-only filesystem, 16 MB temporary filesystem, dropped capabilities, and no privilege escalation.
- Node runs directly as PID 1 under Compose's lightweight init; shutdown closes HTTP then the connection pool.
- Database health check gates application startup. App health check verifies HTTP liveness, not ongoing database availability.
- Local resource budgets: app 192 MB, Postgres 256 MB, one CPU each, 64 MB Postgres shared memory. These are development defaults, not production sizing guarantees.
- No Redis, worker, frontend, monitoring stack, or build tools in production. Actual image size and memory usage have **not yet been measured**.

## Schema, seeding and persistence

`sql/001-init.sql` creates a `tasks` table with an integer identity primary key, non-empty title constraint, Boolean completion state, and three initial sample tasks.

The official Postgres entrypoint runs this file **only on an empty data volume**. Restarting or recreating containers does not reseed or recreate tables. Existing volumes need explicit migrations for later schema changes; editing the init file is not a migration system. A2 SQLite rows are not automatically copied to Postgres.

IDs come from a Postgres sequence. Deletes and reset preserve its high-water mark; gaps are normal. Reset restores seed IDs intentionally and executes in a transaction with a table lock. Nothing uses `TRUNCATE ... RESTART IDENTITY`.

The named volume `taskdata` mounts `/var/lib/postgresql/data`, the correct path for the pinned Postgres 17 image.

```bash
docker compose stop       # Stop containers; preserve data
docker compose start      # Start existing containers
docker compose down       # Remove containers/network; preserve named data volume
docker compose up -d      # Recreate containers using the same data
```

**Do not run `docker compose down -v` unless you intend to permanently delete all local database data.** Do not change the Compose project name/directory when checking persistence: a different project can create a different named volume.

## Persistence proof: ready to run, not yet claimed

Docker execution was deferred at the user's request. The Docker daemon was unavailable during implementation. **No container startup, real Postgres test, restart proof, image-size measurement, or database screenshot has been claimed.**

After Docker is running:

```bash
npm ci
npm run verify:persistence
```

The script builds/starts the stack, creates a uniquely titled row via HTTP, records its ID and data, recreates **both app and database containers** without deleting the volume, then GETs the same ID and asserts identical data. It leaves the row for SQL inspection. Set `PORT` in `.env` or `API_URL` if needed. Expect a final `PASS` only when those assertions succeed.

For a manual check:

1. POST a task using curl below and record its returned ID.
2. Run `docker compose down`, then `docker compose up -d --wait`.
3. GET `/tasks/RETURNED_ID`; confirm the same title and completion state.
4. Run SQL to inspect the same row and capture the terminal for your submission.

```bash
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, title, done FROM tasks ORDER BY id;"'
```

Save your real database screenshot as `screenshots/postgres-persistence.png` and add the verified results/date here after running the procedure. Existing Swagger screenshots are historical, not Postgres persistence evidence.

## HTTP endpoints

| Method | Path            | Result                                            |
| ------ | --------------- | ------------------------------------------------- |
| GET    | `/`             | 200 API metadata                                  |
| GET    | `/health`       | 200 liveness                                      |
| GET    | `/tasks`        | 200 task array; 400 invalid query                 |
| GET    | `/tasks/:id`    | 200 task; 400 malformed ID; 404 absent            |
| POST   | `/tasks`        | 201 task + Location; 400 invalid body             |
| PUT    | `/tasks/:id`    | 200 partial update; 400 invalid input; 404 absent |
| DELETE | `/tasks/:id`    | 204 empty body; 400 malformed ID; 404 absent      |
| GET    | `/stats`        | 200 total, completed, pending                     |
| POST   | `/reset`        | 200 original seed tasks; discards current tasks   |
| GET    | `/docs`         | Redirect to interactive Swagger UI                |
| GET    | `/openapi.json` | 200 OpenAPI 3 document                            |

POST requires a non-empty string `title`, trimmed before storing; `done` starts false. PUT accepts title, Boolean done, or both and preserves unspecified fields. Unknown body properties are ignored; unknown or repeated query parameters are rejected. GET list supports `done=true|false`, case-insensitive literal `search`, positive `limit`, and nonnegative `offset`; filter/search precede pagination. Error bodies use `{ "error": "message" }`. Malformed JSON returns 400, oversized JSON returns 413, unexpected errors return generic 500.

```bash
curl -i -X POST http://localhost:3000/tasks \
  -H 'Content-Type: application/json' -d '{"title":"Survive a restart"}'
curl -i http://localhost:3000/tasks
# Replace 4 with the returned ID:
curl -i -X PUT http://localhost:3000/tasks/4 \
  -H 'Content-Type: application/json' -d '{"done":true}'
curl -i 'http://localhost:3000/tasks?done=true&limit=2&offset=0'
```

## Development and tests

Node.js 22.9+ is required for the optional environment-file CLI flag; Node 24 LTS is recommended and used by the image.

```bash
npm ci
npm test
npm run lint
npm run format:check
```

The default suite exercises A2 SQLite regression behavior, HTTP contracts after async adaptation, and isolated Postgres SQL-builder/rollback tests. The real Postgres integration test **skips explicitly** unless `TEST_DATABASE_URL` is set. It creates and drops a unique test schema; use a development/test database where the user has schema privileges.

For a host-run real Postgres test, use a reachable database URL; the Compose-only hostname `db` cannot resolve from the host. For example, temporarily publish the database only on loopback using a local Compose override, then:

```bash
TEST_DATABASE_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/tasks' npm test
```

For host-run `npm start` / `npm run dev`, set `DATABASE_URL` to a host-reachable address in `.env`. Compose itself needs no npm installation on the host.

