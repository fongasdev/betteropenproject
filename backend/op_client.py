"""Cliente HTTP fino para a API v3 do OpenProject."""
import os
import json
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

OPENPROJECT_URL = os.environ["OPENPROJECT_URL"].rstrip("/")
API_KEY = os.environ["OPENPROJECT_API_KEY"]


def _id_from_href(href: Optional[str]) -> Optional[int]:
    if not href:
        return None
    try:
        return int(href.rstrip("/").rsplit("/", 1)[-1])
    except ValueError:
        return None


class OpenProjectError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"OpenProject API error {status_code}: {detail}")


class OpenProjectClient:
    """Client fino sobre a API v3 (Basic Auth: usuário 'apikey', senha = API key)."""

    def __init__(self):
        self._client = httpx.AsyncClient(
            base_url=f"{OPENPROJECT_URL}/api/v3",
            auth=("apikey", API_KEY),
            headers={"Content-Type": "application/json"},
            timeout=30.0,
        )
        self._user_name_cache: dict[int, str] = {}
        self._status_order_cache: Optional[dict[int, int]] = None

    async def aclose(self):
        await self._client.aclose()

    async def _request(self, method: str, path: str, **kwargs) -> Any:
        resp = await self._client.request(method, path, **kwargs)
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise OpenProjectError(resp.status_code, detail)
        if resp.status_code == 204 or not resp.content:
            return None
        return resp.json()

    # ---- Usuário atual ----
    async def me(self) -> dict:
        return await self._request("GET", "/users/me")

    # ---- Work packages ----
    async def list_work_packages(
        self,
        assignee: Optional[str] = None,
        filters: Optional[list] = None,
        page_size: int = 200,
    ) -> dict:
        f = filters if filters is not None else []
        if assignee:
            f.append({"assignee": {"operator": "=", "values": [assignee]}})
        params = {
            "pageSize": str(page_size),
            "filters": json.dumps(f) if f else "[]",
            "sortBy": json.dumps([["updatedAt", "desc"]]),
        }
        return await self._request("GET", "/work_packages", params=params)

    async def get_work_package(self, wp_id: int) -> dict:
        return await self._request("GET", f"/work_packages/{wp_id}")

    async def update_work_package(self, wp_id: int, lock_version: int, payload: dict) -> dict:
        body = {"lockVersion": lock_version, **payload}
        return await self._request("PATCH", f"/work_packages/{wp_id}", json=body)

    # ---- Status / tipos / projetos (para popular o board) ----
    async def list_statuses(self) -> dict:
        return await self._request("GET", "/statuses")

    async def list_projects(self) -> dict:
        return await self._request("GET", "/projects")

    async def list_available_statuses(self, wp_id: int, lock_version: int) -> list[dict]:
        """Transições de status válidas para o work package (respeita workflow).

        A API v3 não expõe um GET direto para isso; o jeito suportado é o
        endpoint de "form", que devolve em schema.status as allowedValues
        considerando o status atual e o papel do usuário.
        """
        data = await self._request(
            "POST", f"/work_packages/{wp_id}/form", json={"lockVersion": lock_version}
        )
        status_schema = data.get("_embedded", {}).get("schema", {}).get("status", {})
        return status_schema.get("_embedded", {}).get("allowedValues", [])

    async def _status_order(self) -> dict[int, int]:
        """Índice de cada status na ordem do pipeline configurado no OpenProject.

        A ordem retornada por GET /statuses reflete a posição configurada no
        admin (ex.: Nova, Backlog, Backlog-Pronto, ..., Desenvolvendo, ...).
        Usamos isso só como heurística para escolher, entre as transições
        realmente permitidas em cada passo, qual aproxima mais do destino —
        a validação de fato é sempre feita pelo workflow do OpenProject.
        """
        if self._status_order_cache is None:
            data = await self.list_statuses()
            elements = data.get("_embedded", {}).get("elements", [])
            self._status_order_cache = {s["id"]: i for i, s in enumerate(elements)}
        return self._status_order_cache

    async def _status_name(self, status_id: int) -> str:
        data = await self.list_statuses()
        for s in data.get("_embedded", {}).get("elements", []):
            if s["id"] == status_id:
                return s["name"]
        return str(status_id)

    async def _abort_move(
        self,
        wp_id: int,
        current_status_id: int,
        current_lock: int,
        original_status_id: int,
        reason: str,
    ) -> None:
        """Aborta uma movimentação de status em andamento.

        Se algum hop intermediário já tiver sido aplicado de verdade no
        OpenProject, tenta reverter pro status original antes de levantar o
        erro — pra nunca deixar a tarefa "parada no meio do caminho" sem o
        usuário saber. Se a reversão também não for permitida pelo workflow,
        avisa claramente em qual status ela ficou, pra correção manual.
        """
        if current_status_id == original_status_id:
            raise OpenProjectError(422, {"message": reason})

        revert_ok = True
        try:
            await self.update_work_package(
                wp_id,
                current_lock,
                {"_links": {"status": {"href": f"/api/v3/statuses/{original_status_id}"}}},
            )
        except OpenProjectError:
            revert_ok = False

        if revert_ok:
            raise OpenProjectError(
                422, {"message": f"{reason} A tarefa foi revertida automaticamente para o status original."}
            )
        stuck_name = await self._status_name(current_status_id)
        raise OpenProjectError(
            422,
            {
                "message": (
                    f"{reason} Não foi possível reverter automaticamente — a tarefa ficou parada "
                    f"no status intermediário \"{stuck_name}\". Corrija manualmente no OpenProject."
                )
            },
        )

    async def move_work_package_status(
        self, wp_id: int, lock_version: int, target_status_id: int, max_hops: int = 15
    ) -> dict:
        """Move o work package até `target_status_id`, passando pelos status
        intermediários exigidos pelo workflow quando o salto direto não é
        permitido (ex.: Nova -> Desenvolvendo precisa passar por Backlog,
        Backlog-Pronto, Tarefa-Pronta antes).

        Em cada passo, consulta as transições realmente permitidas
        (list_available_statuses) e escolhe a que mais aproxima do destino
        segundo a ordem do pipeline. Se a transição direta já for permitida,
        vai direto — nenhum hop extra é feito nesse caso.

        Se em algum passo intermediário não houver transição válida em
        direção ao destino, a movimentação inteira é abortada — nunca
        deixamos a tarefa parada num status intermediário sem avisar (ver
        `_abort_move`), que tenta reverter pro status original.
        """
        order = await self._status_order()
        target_idx = order.get(target_status_id)

        wp = await self.get_work_package(wp_id)
        original_status_id = _id_from_href(wp.get("_links", {}).get("status", {}).get("href"))
        current_status_id = original_status_id
        current_lock = wp.get("lockVersion", lock_version)

        if current_status_id == target_status_id:
            return wp

        for _ in range(max_hops):
            allowed = await self.list_available_statuses(wp_id, current_lock)
            allowed_ids = {a["id"] for a in allowed}

            if target_status_id in allowed_ids:
                return await self.update_work_package(
                    wp_id,
                    current_lock,
                    {"_links": {"status": {"href": f"/api/v3/statuses/{target_status_id}"}}},
                )

            # Escolhe, entre as transições permitidas, a que mais aproxima do
            # destino sem passar por ele (evita ultrapassar ou entrar em
            # ramais como Rejeitada/Pausado que não têm índice conhecido).
            current_idx = order.get(current_status_id)
            candidates = []
            for a in allowed:
                if a["id"] == current_status_id:
                    continue
                a_idx = order.get(a["id"])
                if a_idx is None or target_idx is None or current_idx is None:
                    continue
                if target_idx > current_idx and current_idx < a_idx <= target_idx:
                    candidates.append((a_idx, a))
                elif target_idx < current_idx and target_idx <= a_idx < current_idx:
                    candidates.append((a_idx, a))

            if not candidates:
                await self._abort_move(
                    wp_id,
                    current_status_id,
                    current_lock,
                    original_status_id,
                    (
                        f"Não foi possível encontrar um caminho de transição até o status "
                        f"{target_status_id}. Transições permitidas a partir do status atual: "
                        f"{[a['name'] for a in allowed]}."
                    ),
                )

            # Se target_idx > current_idx, queremos o maior a_idx (mais perto do destino);
            # senão, o menor a_idx.
            reverse = target_idx is not None and current_idx is not None and target_idx > current_idx
            candidates.sort(key=lambda c: c[0], reverse=reverse)
            _, next_status = candidates[0]

            updated = await self.update_work_package(
                wp_id,
                current_lock,
                {"_links": {"status": {"href": f"/api/v3/statuses/{next_status['id']}"}}},
            )
            current_lock = updated["lockVersion"]
            current_status_id = next_status["id"]

        await self._abort_move(
            wp_id,
            current_status_id,
            current_lock,
            original_status_id,
            f"Excedido o número máximo de {max_hops} passos ao tentar chegar ao status {target_status_id}.",
        )

    # ---- Comentários / atividades ----
    async def list_activities(self, wp_id: int) -> dict:
        wp = await self.get_work_package(wp_id)
        activities_href = wp.get("_links", {}).get("activities", {}).get("href")
        if not activities_href:
            return {"_embedded": {"elements": []}}
        return await self._request("GET", activities_href.replace("/api/v3", ""))

    async def user_name(self, user_id: int) -> str:
        """Nome do usuário, com cache em memória (a API de activities não embute o título)."""
        if user_id in self._user_name_cache:
            return self._user_name_cache[user_id]
        try:
            data = await self._request("GET", f"/users/{user_id}")
            name = data.get("name") or f"Usuário #{user_id}"
        except OpenProjectError:
            name = f"Usuário #{user_id}"
        self._user_name_cache[user_id] = name
        return name

    # ---- Notificações nativas do OpenProject ----
    async def list_notifications(self, page_size: int = 200) -> dict:
        """Notificações do usuário autenticado (menções, atribuições,
        comentários, alertas de data, etc.), mais recentes primeiro.

        Não filtramos `readIAN` no servidor (a sintaxe de filtro booleano da
        API v3 não é bem documentada) — pegamos a página e filtramos as não
        lidas aqui no client.
        """
        params = {
            "pageSize": str(page_size),
            "sortBy": json.dumps([["createdAt", "desc"]]),
        }
        return await self._request("GET", "/notifications", params=params)

    async def add_comment(self, wp_id: int, comment: str) -> dict:
        return await self._request(
            "POST",
            f"/work_packages/{wp_id}/activities",
            json={"comment": {"raw": comment}},
        )


client = OpenProjectClient()
