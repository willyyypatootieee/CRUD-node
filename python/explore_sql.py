"""Five read-only SQL exercises; initialize the database before running."""

import os
import sqlite3
from contextlib import closing
from pathlib import Path

path = Path(os.environ.get("DATABASE_PATH") or Path(__file__).resolve().parents[1] / "data" / "tasks.db")
queries = [
    ("1. All tasks", "SELECT id, title, done FROM tasks ORDER BY id", ()),
    ("2. Pending tasks", "SELECT id, title, done FROM tasks WHERE done = ?", (0,)),
    ("3. Title search", "SELECT id, title, done FROM tasks WHERE title LIKE ?", ("%Swagger%",)),
    ("4. Alphabetical titles", "SELECT id, title, done FROM tasks ORDER BY title", ()),
    ("5. Statistics", "SELECT COUNT(*) AS total, COUNT(CASE WHEN done = 1 THEN 1 END) AS completed, COUNT(CASE WHEN done = 0 THEN 1 END) AS pending FROM tasks", ()),
]

with closing(sqlite3.connect(f"{path.resolve().as_uri()}?mode=ro", uri=True, timeout=5)) as db:
    for label, sql, parameters in queries:
        print(f"\n{label}\n{sql}")
        cursor = db.execute(sql, parameters)
        print(" | ".join(column[0] for column in cursor.description))
        for row in cursor:
            print(" | ".join(map(str, row)))
