"""Backend FastAPI: frontend amigável para o OpenProject.

Expõe uma API simplificada consumida pelo frontend estático e faz proxy
das chamadas necessárias para a API v3 do OpenProject.
"""
import os
from pathlib import Path
from typing import Optional

import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .op_client import client, OpenProjectError, OPENPROJECT_URL

app = FastAPI(title="Better OpenProject")

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
_anthropic_key = os.environ.get("ANTHROPIC_API_KEY")
anthropic_client = anthropic.AsyncAnthropic(api_key=_anthropic_key) if _anthropic_key else None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

REACT_DIST = Path(__file__).resolve().parent.parent / "frontend-react" / "dist"
LEGACY_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
FRONTEND_DIR = REACT_DIST if REACT_DIST.exists() else LEGACY_FRONTEND


def _err(e: OpenProjectError):
    raise HTTPException(status_code=e.status_code if e.status_code < 500 else 502, detail=e.detail)


def _id_from_href(href: Optional[str]) -> Optional[int]:
    if not href:
        return None
    try:
        return int(href.rstrip("/").rsplit("/", 1)[-1])
    except ValueError:
        return None


@app.get("/api/config")
async def config():
    return {"openProjectUrl": OPENPROJECT_URL}


@app.get("/api/me")
async def me():
    try:
        return await client.me()
    except OpenProjectError as e:
        _err(e)


@app.get("/api/statuses")
async def statuses():
    try:
        data = await client.list_statuses()
        return data.get("_embedded", {}).get("elements", [])
    except OpenProjectError as e:
        _err(e)


@app.get("/api/work_packages")
async def work_packages(only_me: bool = True):
    try:
        assignee = None
        if only_me:
            user = await client.me()
            assignee = str(user["id"])
        data = await client.list_work_packages(assignee=assignee)
        elements = data.get("_embedded", {}).get("elements", [])
        # Formato simplificado para o frontend
        result = []
        for wp in elements:
            links = wp.get("_links", {})
            project_link = links.get("project", {})
            result.append({
                "id": wp["id"],
                "subject": wp.get("subject"),
                "type": links.get("type", {}).get("title"),
                "status": links.get("status", {}).get("title"),
                "statusHref": links.get("status", {}).get("href"),
                "project": project_link.get("title"),
                "projectId": _id_from_href(project_link.get("href")),
                "assignee": links.get("assignee", {}).get("title"),
                "startDate": wp.get("startDate"),
                "dueDate": wp.get("dueDate"),
                "updatedAt": wp.get("updatedAt"),
                "lockVersion": wp.get("lockVersion"),
                "percentageDone": wp.get("percentageDone"),
                "priority": links.get("priority", {}).get("title"),
            })
        return result
    except OpenProjectError as e:
        _err(e)


@app.get("/api/work_packages/{wp_id}/available_statuses")
async def available_statuses(wp_id: int, lock_version: int):
    try:
        return await client.list_available_statuses(wp_id, lock_version)
    except OpenProjectError as e:
        _err(e)


class StatusChange(BaseModel):
    lockVersion: int
    statusId: int


@app.patch("/api/work_packages/{wp_id}/status")
async def change_status(wp_id: int, body: StatusChange):
    """Move o work package para o status pedido pelo front (ex.: drag&drop no board).

    Quando o workflow do OpenProject não permite o salto direto, avança
    automaticamente pelos status intermediários necessários — o front sempre
    manda só a origem/destino e recebe de volta o work package já no status
    final desejado.
    """
    try:
        updated = await client.move_work_package_status(wp_id, body.lockVersion, body.statusId)
        return updated
    except OpenProjectError as e:
        detail = e.detail
        message = detail.get("message") if isinstance(detail, dict) else str(detail)
        raise HTTPException(status_code=422, detail=message or "Transição de status não permitida.")


class DatesChange(BaseModel):
    lockVersion: int
    startDate: Optional[str] = None
    dueDate: Optional[str] = None


@app.patch("/api/work_packages/{wp_id}/dates")
async def change_dates(wp_id: int, body: DatesChange):
    try:
        payload = {}
        if body.startDate is not None:
            payload["startDate"] = body.startDate
        if body.dueDate is not None:
            payload["dueDate"] = body.dueDate
        updated = await client.update_work_package(wp_id, body.lockVersion, payload)
        return updated
    except OpenProjectError as e:
        _err(e)


@app.get("/api/work_packages/{wp_id}/activities")
async def activities(wp_id: int):
    try:
        data = await client.list_activities(wp_id)
        elements = data.get("_embedded", {}).get("elements", [])
        parsed = []
        for a in elements:
            links = a.get("_links", {})
            details = [d.get("raw") for d in a.get("details", []) if d.get("raw")]
            user_link = links.get("user", {})
            parsed.append({
                "id": a.get("id"),
                "comment": a.get("comment", {}).get("raw") if a.get("comment") else None,
                "details": details,
                "statusChanged": any("status" in d.lower() for d in details),
                "user": user_link.get("title"),
                "userId": _id_from_href(user_link.get("href")),
                "createdAt": a.get("createdAt"),
            })
        # A API de activities não embute o nome do usuário — resolve via cache.
        missing_ids = {p["userId"] for p in parsed if p["userId"] and not p["user"]}
        if missing_ids:
            import asyncio

            names = await asyncio.gather(*(client.user_name(uid) for uid in missing_ids))
            name_by_id = dict(zip(missing_ids, names))
            for p in parsed:
                if p["userId"] in name_by_id:
                    p["user"] = name_by_id[p["userId"]]
        return parsed
    except OpenProjectError as e:
        _err(e)


async def _build_ai_prompt(wp_id: int) -> str:
    """Busca a task completa no OpenProject e monta um super prompt autocontido.

    A IA que recebe esse prompt não tem acesso ao OpenProject (nem ao link da
    task) — por isso puxamos aqui tudo que ela precisaria saber (descrição,
    metadados, comentários com autor/data) e embutimos no texto.
    """
    try:
        wp = await client.get_work_package(wp_id)
        activities_data = await client.list_activities(wp_id)
    except OpenProjectError as e:
        _err(e)

    links = wp.get("_links", {})
    subject = wp.get("subject") or "(sem título)"
    wp_type = links.get("type", {}).get("title") or "—"
    project = links.get("project", {}).get("title") or "—"
    status = links.get("status", {}).get("title") or "—"
    priority = links.get("priority", {}).get("title") or "—"
    assignee = links.get("assignee", {}).get("title") or "ninguém"
    author = links.get("author", {}).get("title") or "—"
    start_date = wp.get("startDate") or "—"
    due_date = wp.get("dueDate") or "—"
    percentage = wp.get("percentageDone")
    description = ((wp.get("description") or {}).get("raw") or "").strip()

    comment_activities = [
        a
        for a in activities_data.get("_embedded", {}).get("elements", [])
        if a.get("comment") and a.get("comment", {}).get("raw")
    ]
    missing_ids = {
        _id_from_href(a.get("_links", {}).get("user", {}).get("href"))
        for a in comment_activities
    }
    missing_ids.discard(None)
    name_by_id = {}
    if missing_ids:
        import asyncio

        names = await asyncio.gather(*(client.user_name(uid) for uid in missing_ids))
        name_by_id = dict(zip(missing_ids, names))

    comments = []
    for a in comment_activities:
        user = a.get("_links", {}).get("user", {}).get("title")
        if not user:
            uid = _id_from_href(a.get("_links", {}).get("user", {}).get("href"))
            user = name_by_id.get(uid, "?")
        when = (a.get("createdAt") or "")[:10]
        comments.append(f"[{when} — {user}]: {a['comment']['raw'].strip()}")

    parts = [
        f"# Tarefa #{wp_id} — {subject}",
        "",
        "Você vai resolver a tarefa abaixo, extraída do sistema de gestão de "
        "projetos (OpenProject). Você NÃO tem acesso ao OpenProject nem a "
        "nenhum link dele — todo o contexto necessário já está neste prompt.",
        "",
        "## Metadados",
        f"- Projeto: {project}",
        f"- Tipo: {wp_type}",
        f"- Status atual: {status}",
        f"- Prioridade: {priority}",
        f"- Responsável: {assignee}",
        f"- Autor: {author}",
        f"- Data de início: {start_date}",
        f"- Prazo: {due_date}",
        f"- Progresso: {percentage if percentage is not None else '—'}%",
        "",
        "## Descrição",
        description if description else "(a task não tem descrição preenchida)",
    ]
    if comments:
        parts += ["", "## Histórico de comentários (mais antigo primeiro)"]
        parts += [f"- {c}" for c in comments]
    parts += [
        "",
        "## O que fazer",
        "1. Leia a descrição e o histórico de comentários acima com atenção — "
        "é a única fonte de contexto sobre essa tarefa, não existe link "
        "externo pra consultar.",
        "2. Explore o repositório atual pra entender onde e como a mudança "
        "deve entrar (convenções de código, arquivos relacionados, testes "
        "existentes).",
        "3. Implemente a solução completa — código funcional, seguindo o "
        "estilo do projeto, com testes quando fizer sentido.",
        "4. Se algo essencial estiver ambíguo ou faltando pra prosseguir, "
        "pare e pergunte antes de assumir.",
        "5. Ao final, resuma o que foi feito e liste os arquivos alterados.",
    ]
    return "\n".join(parts)


@app.get("/api/work_packages/{wp_id}/ai_prompt")
async def ai_prompt(wp_id: int):
    """Monta um prompt pronto pra colar no Claude Code resolver a task."""
    return {"prompt": await _build_ai_prompt(wp_id)}


@app.post("/api/work_packages/{wp_id}/ai_resolve")
async def ai_resolve(wp_id: int):
    """Manda a task direto pra API da Claude e devolve a resposta do modelo."""
    if anthropic_client is None:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY não configurada no backend.",
        )
    prompt = await _build_ai_prompt(wp_id)
    try:
        message = await anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Erro na API da Claude: {e}")

    text = "".join(block.text for block in message.content if block.type == "text")
    return {"prompt": prompt, "response": text}


@app.get("/api/projects")
async def projects():
    try:
        data = await client.list_projects()
        elements = data.get("_embedded", {}).get("elements", [])
        return [{"id": p["id"], "name": p.get("name")} for p in elements]
    except OpenProjectError as e:
        _err(e)


class CommentBody(BaseModel):
    comment: str


@app.post("/api/work_packages/{wp_id}/comments")
async def add_comment(wp_id: int, body: CommentBody):
    try:
        return await client.add_comment(wp_id, body.comment)
    except OpenProjectError as e:
        _err(e)


@app.on_event("shutdown")
async def shutdown():
    await client.aclose()


# Frontend estático — build do React (vite build gera dist/assets/*),
# ou o SPA legado em frontend/ se o build ainda não foi gerado.
assets_dir = FRONTEND_DIR / "assets"
if assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/{full_path:path}")
async def spa(full_path: str):
    # Deixa a API responder normalmente; qualquer outra rota cai no index.html
    # (roteamento client-side do React, se um dia for adicionado).
    return FileResponse(str(FRONTEND_DIR / "index.html"))
