"""Sessão de login do SmartFlow — stateless (nada guardado em memória do servidor).

Cada pessoa loga com a própria API key do OpenProject (gerada em My Account ->
Access token -> API). O backend valida a key chamando /users/me e devolve um
cookie httpOnly cujo valor é a api_key + dados do usuário, criptografados
(Fernet, AES + HMAC autenticado) com SESSION_SECRET_KEY — só o servidor
consegue abrir esse cookie, e o próprio cookie carrega timestamp pra expirar
sozinho depois de SESSION_TTL_SECONDS.

Isso substitui o dict em memória usado antes: aquele modelo só funciona com
um processo único e de vida longa (derruba todo mundo a cada restart/deploy,
e não funciona se o host sobe múltiplas instâncias ou funções serverless que
não compartilham RAM). Sessão stateless funciona igual em qualquer topologia
— cada instância valida sozinha, só lendo o cookie.

A api_key nunca é gravada em disco/banco — só trafega criptografada dentro do
cookie do próprio navegador da pessoa.
"""
import json
import os
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, Request

from .op_client import OpenProjectClient, OpenProjectError

SESSION_COOKIE = "smartflow_session"
SESSION_TTL_SECONDS = 12 * 3600

_secret = os.environ["SESSION_SECRET_KEY"]
_fernet = Fernet(_secret.encode())


class Session:
    __slots__ = ("client", "user")

    def __init__(self, client: OpenProjectClient, user: dict):
        self.client = client
        self.user = user


def _encrypt(api_key: str, user: dict) -> str:
    payload = json.dumps({"api_key": api_key, "user": user}).encode()
    return _fernet.encrypt(payload).decode()


def _decrypt(token: str) -> Optional[dict]:
    try:
        payload = _fernet.decrypt(token.encode(), ttl=SESSION_TTL_SECONDS)
    except InvalidToken:
        return None  # cookie forjado, corrompido, ou vencido (TTL embutido no token)
    return json.loads(payload)


async def login(api_key: str) -> tuple[str, dict]:
    """Valida a API key contra o OpenProject e monta o token de sessão.
    Levanta OpenProjectError se a key for inválida/sem acesso."""
    api_key = (api_key or "").strip()
    if not api_key:
        raise OpenProjectError(400, {"message": "Informe sua API key do OpenProject."})

    client = OpenProjectClient(api_key)
    try:
        user = await client.me()
    finally:
        await client.aclose()

    token = _encrypt(api_key, user)
    return token, user


async def get_session(request: Request):
    """Dependency do FastAPI: abre a sessão a partir do cookie, cria um
    OpenProjectClient próprio pra essa requisição só e garante que ele feche
    no final — nada fica vivo entre requisições."""
    token = request.cookies.get(SESSION_COOKIE)
    data = _decrypt(token) if token else None
    if data is None:
        raise HTTPException(
            status_code=401, detail="Não autenticado — faça login com sua API key do OpenProject."
        )
    client = OpenProjectClient(data["api_key"])
    try:
        yield Session(client, data["user"])
    finally:
        await client.aclose()
