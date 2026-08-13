"""Persistência (Postgres) do módulo de Agenda.

Guarda o planejamento de tarefas por dia: qual work package foi alocado
pra qual data, com estimativa de horas própria (não vem do OpenProject).
Isso não existe na API v3 do OpenProject — é uma feature só nossa.

Toda entrada pertence a um `user_id` (id do usuário no OpenProject, vindo da
sessão logada) — cada pessoa só enxerga/mexe na própria agenda, nunca na de
outra. Trocamos SQLite (arquivo local) por Postgres porque em deploy (host
gerenciado, múltiplas instâncias) não existe disco local persistente
garantido — o banco precisa morar num serviço externo.
"""
import os
from typing import Optional

import asyncpg

DATABASE_URL = os.environ["DATABASE_URL"]

_pool: Optional[asyncpg.Pool] = None

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS schedule_entries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    wp_id INTEGER NOT NULL,
    wp_subject TEXT NOT NULL,
    date TEXT NOT NULL,
    estimated_hours REAL NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_schedule_user_date ON schedule_entries(user_id, date);
"""


async def init_pool():
    global _pool
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    async with _pool.acquire() as conn:
        await conn.execute(_CREATE_TABLE_SQL)


async def close_pool():
    if _pool is not None:
        await _pool.close()


async def list_entries(user_id: int, start: Optional[str] = None, end: Optional[str] = None):
    query = "SELECT * FROM schedule_entries WHERE user_id = $1"
    params = [user_id]
    if start and end:
        query += " AND date BETWEEN $2 AND $3"
        params += [start, end]
    query += " ORDER BY date ASC, position ASC, id ASC"
    async with _pool.acquire() as conn:
        rows = await conn.fetch(query, *params)
        return [dict(r) for r in rows]


async def create_entry(user_id: int, wp_id: int, wp_subject: str, date: str, estimated_hours: float):
    async with _pool.acquire() as conn:
        async with conn.transaction():
            position = await conn.fetchval(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM schedule_entries WHERE user_id = $1 AND date = $2",
                user_id,
                date,
            )
            row = await conn.fetchrow(
                """
                INSERT INTO schedule_entries (user_id, wp_id, wp_subject, date, estimated_hours, position)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *
                """,
                user_id,
                wp_id,
                wp_subject,
                date,
                estimated_hours,
                position,
            )
            return dict(row)


async def update_entry(
    user_id: int,
    entry_id: int,
    date: Optional[str] = None,
    estimated_hours: Optional[float] = None,
    position: Optional[int] = None,
):
    fields, params = [], []
    if date is not None:
        params.append(date)
        fields.append(f"date = ${len(params)}")
    if estimated_hours is not None:
        params.append(estimated_hours)
        fields.append(f"estimated_hours = ${len(params)}")
    if position is not None:
        params.append(position)
        fields.append(f"position = ${len(params)}")
    if not fields:
        return await get_entry(user_id, entry_id)
    params += [entry_id, user_id]
    query = (
        f"UPDATE schedule_entries SET {', '.join(fields)} "
        f"WHERE id = ${len(params) - 1} AND user_id = ${len(params)} RETURNING *"
    )
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(query, *params)
        return dict(row) if row else None


async def get_entry(user_id: int, entry_id: int):
    async with _pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM schedule_entries WHERE id = $1 AND user_id = $2", entry_id, user_id
        )
        return dict(row) if row else None


async def delete_entry(user_id: int, entry_id: int):
    async with _pool.acquire() as conn:
        await conn.execute("DELETE FROM schedule_entries WHERE id = $1 AND user_id = $2", entry_id, user_id)


async def delete_by_wp_id(user_id: int, wp_id: int):
    """Remove a tarefa de todos os dias/agendas dessa pessoa em que ela foi planejada."""
    async with _pool.acquire() as conn:
        await conn.execute("DELETE FROM schedule_entries WHERE wp_id = $1 AND user_id = $2", wp_id, user_id)
