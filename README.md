# TaskFlow API

Persistent CRUD API for **FlyRank Internship · Backend Track · W3 A1 · Revision 1.1**.
JavaScript, Express 5, better-sqlite3, SQLite, Python 3, and OpenAPI. Native Arch Linux / EndeavourOS development; no Docker, ORM, Python HTTP server, or external database service.

## Setup

Requires Node.js 22 or newer (supported LTS recommended), npm, Python 3, and the native SQLite CLI. The target SQLite version is **3.54**. Python includes `sqlite3`; do not install it with pip. The Node driver bundles its own SQLite version, independent of the system CLI and Python library.

```bash
sqlite3 --version
python3 -c 'import sqlite3; print(sqlite3.sqlite_version)'
npm ci
npm start
```

The dependency is already declared; `npm install better-sqlite3` installs it when adapting an older checkout. A native driver build may require Arch's `base-devel` and Python if a prebuilt binary is unavailable.

- API: <http://localhost:3000>
- Swagger UI: <http://localhost:3000/docs>
- OpenAPI: <http://localhost:3000/openapi.json>
- Health: <http://localhost:3000/health>

Startup creates `data/tasks.db`, its schema, and three sample tasks once. Changes survive restarts, including deletion of every task. An empty database file created manually before startup is safe. No Python startup command is required.

`PORT=4000 npm start` changes the port. `DATABASE_PATH=/absolute/path/tasks.db npm start` selects another file. Node and Python default to the same project-relative file regardless of the shell's working directory; use the same absolute override for both. Stop with Ctrl+C; the server closes its database after draining requests.

## Architecture

```text
HTTP -> Express routes -> TaskController -> TaskService -> TaskRepository -> SQLite
Python initialization / seeding / SQL exploration ------------------------> SQLite
```

Controllers, validation, routes, and error handling retain their previous contracts. The repository uses prepared SQL statements, converts stored `0`/`1` to JSON `false`/`true`, and implements filtering, search, pagination, and statistics in SQL.

```text
src/
  config/database.js              # Connection, schema, transactional initialization
  controllers/TaskController.js
  data/seedTasks.js                # Node's three initial tasks
  docs/openapi.json
  errors/AppError.js
  middleware/{errorHandler,notFoundHandler}.js
  repositories/TaskRepository.js
  routes/{index,taskRoutes,utilityRoutes}.js
  services/TaskService.js
  validators/taskValidator.js
  app.js                          # Factory; no listener on import
  server.js                       # Listener and shutdown
python/
  init_db.py
  seed.py
  explore_sql.py
data/tasks.db                     # Runtime data, ignored by Git
tests/
screenshots/swagger-ui.png
```

### Database

```sql
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
);
```

An auxiliary `task_metadata` table stores `next_id`. This is both an initialization marker and a durable ID high-water mark, preserving the original API's non-reuse behavior without changing the required `tasks` schema. Automatic seeds are inserted only when the tasks table is first created. Existing tasks tables, even empty ones, are adopted without seeding. Explicit `/reset` is separate from automatic initialization.

Both runtimes use `BEGIN IMMEDIATE` transactions for initialization, a five-second busy timeout, foreign keys, and WAL journal mode. Competing initializers serialize, then recheck the marker under the writer lock. Schema creation and seeds commit atomically. Node never launches Python during startup. Keep the database on a local filesystem; WAL is not intended for network filesystem sharing.

All user-provided values are bound parameters. SQL column and clause choices come only from fixed application code. Search escapes `%`, `_`, and `\` to preserve literal substring semantics. SQLite's built-in `LOWER`/`LIKE` is ASCII-case-insensitive, not full Unicode case folding.

`tasks.db`, `tasks.db-wal`, and `tasks.db-shm` are ignored. Do not remove WAL sidecars from a running database or copy only the main file while writes are active; use SQLite's backup facilities.

## API contracts

| Method | Path            | Behavior                           | Status codes       |
| ------ | --------------- | ---------------------------------- | ------------------ |
| GET    | `/`             | API metadata                       | 200                |
| GET    | `/health`       | `{ "status": "ok" }`               | 200                |
| GET    | `/tasks`        | Task array; filters and pagination | 200, 400           |
| GET    | `/tasks/:id`    | One task                           | 200, 400, 404      |
| POST   | `/tasks`        | Create; `Location` header          | 201, 400, 413      |
| PUT    | `/tasks/:id`    | Partial title/done update          | 200, 400, 404, 413 |
| DELETE | `/tasks/:id`    | Delete; empty body                 | 204, 400, 404      |
| GET    | `/stats`        | Total/completed/pending counts     | 200                |
| POST   | `/reset`        | Restore original seeds             | 200                |
| GET    | `/docs`         | Swagger UI                         | 301, then 200      |
| GET    | `/openapi.json` | API specification                  | 200                |

```json
{ "id": 1, "title": "Complete FlyRank assignment", "done": false }
```

- IDs are positive safe integers; leading zeros, signs, decimals, suffixes, and unsafe integers return 400.
- Titles must be nonempty strings after trimming. POST always sets `done: false`, regardless of supplied `done`.
- PUT preserves omitted fields and requires at least one recognized field. `done` must be a JSON Boolean. Unknown fields are ignored; `id` cannot be overwritten.
- Invalid updates are rejected before mutation. Invalid update bodies take precedence over missing-task errors for valid IDs.
- Error shape: `{ "error": "Task 99 not found" }`. Unknown routes return JSON 404; unexpected errors return generic JSON 500. Malformed JSON returns 400 and bodies over 16kb return 413.

### CRUD walkthrough

```bash
curl -i http://localhost:3000/tasks
curl -i http://localhost:3000/tasks/1
curl -i -X POST http://localhost:3000/tasks \
  -H 'Content-Type: application/json' -d '{"title":"Buy milk"}'
# Use the ID returned by POST; 4 applies only to a freshly initialized database.
curl -i -X PUT http://localhost:3000/tasks/4 \
  -H 'Content-Type: application/json' -d '{"title":"Buy groceries","done":true}'
curl -i -X DELETE http://localhost:3000/tasks/4
curl -i http://localhost:3000/tasks/4
```

### Filtering, search, pagination, statistics

```bash
curl 'http://localhost:3000/tasks?done=false&search=assignment&limit=2&offset=0'
curl http://localhost:3000/stats
```

`done` accepts exactly `true` or `false`. `search` is a trimmed case-insensitive substring (empty matches all). `limit` is a positive safe integer; omitted means unlimited. `offset` is a non-negative safe integer, default 0. Unknown or repeated parameters return 400. Filtering precedes pagination; results retain ID/insertion order and return a JSON array. Sorting is demonstrated in the SQL utility, not added to the HTTP contract.

Statistics use SQL `COUNT(*)` across all tasks: initially `{ "total": 3, "completed": 1, "pending": 2 }`.

**`POST /reset` deletes current tasks and restores the original three seeds.** It is an unauthenticated local-development helper, not a production administration endpoint. Generated IDs are not recycled, even after reset or restart; seed IDs are intentionally restored.

## Python utilities and SQL exercises

```bash
python3 python/init_db.py
python3 python/seed.py
python3 python/explore_sql.py
```

Initialization and seeding are idempotent; neither restores an existing empty task table. `init_db.py --database /absolute/path/tasks.db` overrides the file. Other utilities accept `DATABASE_PATH`. Exploration opens the file read-only and prints SQL plus actual results for five exercises:

1. List all tasks: `SELECT id, title, done FROM tasks ORDER BY id`.
2. Filter pending tasks: `SELECT id, title, done FROM tasks WHERE done = ?` with `0`.
3. Search titles: `SELECT id, title, done FROM tasks WHERE title LIKE ?` with `%Swagger%`.
4. Sort alphabetically: `SELECT id, title, done FROM tasks ORDER BY title`.
5. Count total, completed, and pending tasks with `COUNT(*)` and conditional counts.

The revised PRD does not enumerate its five required assignment queries. These five cover the stated operations; compare them with the original assignment before submission.

### Native inspection

```bash
sqlite3 data/tasks.db
```

```sql
.headers on
.mode column
.tables
SELECT * FROM tasks;
.quit
```

Opening a nonexistent file with the CLI creates an empty file, not the application schema. Initialize first for inspection.

## Screenshots

![Swagger UI](screenshots/swagger-ui.png)

The existing Swagger capture is retained. Capture the native SQLite CLI after running the inspection commands and save a genuine screenshot as `screenshots/sqlite-database.png`; this artifact is not generated by the API or tests.

## Tests and checks

```bash
npm test
npm run lint
npm run format:check
```

HTTP regressions cover TC-01–TC-18, filtering, pagination, validation, atomic updates, statistics, reset, errors, and documentation. Each HTTP fixture explicitly uses an isolated in-memory SQLite database and closes it afterward. Disk tests cover restart persistence, empty-table persistence, durable IDs, schema constraints, configuration, SQL injection/literal wildcard handling, and concurrent Python/Node initialization. Python 3 is required for cross-runtime tests.

`createApp()` defaults to persistent storage; callers own `app.locals.database` and must close it after stopping their server. Merely importing the module does not open a database or listener.

## Assignment stages and publishing

- Stage 0: automatic transactional database creation and one-time seeds.
- Stage 1: SQL SELECT for list and individual reads.
- Stage 2: prepared INSERT, preserving validation and HTTP 201.
- Stage 3: prepared UPDATE/DELETE, preserving 404 behavior.
- Stage 4: execute the five SQL exercises above; confirm against the original assignment.
- Stage 5: run regression checks, capture the SQLite screenshot, review changes, and publish.

Publishing requires review and GitHub credentials. No commit or push is performed automatically:

```bash
git status
git remote -v
# After reviewing and committing the intended source/documentation changes:
git push -u origin HEAD
```

Do not commit database files or credentials. There is no authentication, authorization, rate limiting, or production deployment configuration; any reachable client can modify tasks or invoke reset. Keep this API in a trusted local environment.

**This implementation is AI-assisted.** Prior stage commits do not establish compliance with any hand-built-work requirement. Review FlyRank's AI policy and complete any required independent work yourself. No independent comparison baseline is claimed.
