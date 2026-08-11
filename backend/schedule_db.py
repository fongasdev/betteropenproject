"""Persistência simples (SQLite) do módulo de Agenda.

Guarda o planejamento de tarefas por dia: qual work package foi alocado
pra qual data, com estimativa de horas própria (não vem do OpenProject).
Isso não existe na API v3 do OpenProject — é uma feature só nossa.
"""
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).resolve().parent / "schedule.db"


def _init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schedule_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                wp_id INTEGER NOT NULL,
                wp_subject TEXT NOT NULL,
                date TEXT NOT NULL,
                estimated_hours REAL NOT NULL,
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_schedule_date ON schedule_entries(date)"
        )


_init_db()


@contextmanager
def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def list_entries(start: Optional[str] = None, end: Optional[str] = None):
    query = "SELECT * FROM schedule_entries"
    params = []
    if start and end:
        query += " WHERE date BETWEEN ? AND ?"
        params = [start, end]
    query += " ORDER BY date ASC, position ASC, id ASC"
    with _conn() as conn:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]


def create_entry(wp_id: int, wp_subject: str, date: str, estimated_hours: float):
    with _conn() as conn:
        cur = conn.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM schedule_entries WHERE date = ?",
            (date,),
        )
        position = cur.fetchone()[0]
        cur = conn.execute(
            """
            INSERT INTO schedule_entries (wp_id, wp_subject, date, estimated_hours, position)
            VALUES (?, ?, ?, ?, ?)
            """,
            (wp_id, wp_subject, date, estimated_hours, position),
        )
        row = conn.execute(
            "SELECT * FROM schedule_entries WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return dict(row)


def update_entry(
    entry_id: int,
    date: Optional[str] = None,
    estimated_hours: Optional[float] = None,
    position: Optional[int] = None,
):
    fields, params = [], []
    if date is not None:
        fields.append("date = ?")
        params.append(date)
    if estimated_hours is not None:
        fields.append("estimated_hours = ?")
        params.append(estimated_hours)
    if position is not None:
        fields.append("position = ?")
        params.append(position)
    if not fields:
        return get_entry(entry_id)
    params.append(entry_id)
    with _conn() as conn:
        conn.execute(
            f"UPDATE schedule_entries SET {', '.join(fields)} WHERE id = ?", params
        )
        row = conn.execute(
            "SELECT * FROM schedule_entries WHERE id = ?", (entry_id,)
        ).fetchone()
        return dict(row) if row else None


def get_entry(entry_id: int):
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM schedule_entries WHERE id = ?", (entry_id,)
        ).fetchone()
        return dict(row) if row else None


def delete_entry(entry_id: int):
    with _conn() as conn:
        conn.execute("DELETE FROM schedule_entries WHERE id = ?", (entry_id,))
