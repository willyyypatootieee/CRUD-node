"""Seed only on first initialization; never repopulate an existing empty table."""

SEED_TASKS = [
    (1, "Complete FlyRank assignment", 0),
    (2, "Review HTTP status codes", 1),
    (3, "Explore Swagger UI", 0),
]

if __name__ == "__main__":
    from init_db import initialize

    db = initialize()
    print(f"Initialization complete; {db.execute('SELECT COUNT(*) FROM tasks').fetchone()[0]} tasks")
    db.close()
