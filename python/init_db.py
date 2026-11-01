"""Initialize the same SQLite file as Node, under an exclusive writer transaction."""

import argparse
import os
import sqlite3
from pathlib import Path

from seed import SEED_TASKS

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "data" / "tasks.db"


def initialize(database_path=None):
    path = Path(database_path or os.environ.get("DATABASE_PATH") or DEFAULT_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path, timeout=5)
    try:
        db.execute("PRAGMA foreign_keys = ON")
        db.execute("PRAGMA journal_mode = WAL")
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tasks'"
        ).fetchone()
        db.execute("""
            CREATE TABLE IF NOT EXISTS tasks (
                id INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS task_metadata (
                key TEXT PRIMARY KEY,
                value INTEGER NOT NULL
            )
        """)
        initialized = db.execute(
            "SELECT value FROM task_metadata WHERE key = 'next_id'"
        ).fetchone()
        if not initialized:
            if not existing:
                db.executemany(
                    "INSERT INTO tasks (id, title, done) VALUES (?, ?, ?)", SEED_TASKS
                )
            db.execute("""
                INSERT INTO task_metadata (key, value)
                VALUES ('next_id', (SELECT COALESCE(MAX(id), 0) + 1 FROM tasks))
            """)
        db.commit()
        return db
    except BaseException:
        db.rollback()
        db.close()
        raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", help="SQLite file; defaults to DATABASE_PATH or data/tasks.db")
    args = parser.parse_args()
    connection = initialize(args.database)
    print(f"Initialized: {connection.execute('PRAGMA database_list').fetchone()[2]}")
    connection.close()
