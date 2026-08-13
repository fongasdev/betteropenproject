# SmartFlow

Frontend próprio (Kanban com drag-and-drop) para suas tasks no OpenProject,
usando a API v3. Frontend em **React** (Vite + dnd-kit + framer-motion),
backend em **FastAPI**, que atua como proxy simplificado para a API do
OpenProject.

Cada pessoa loga no SmartFlow com a **própria API key** do OpenProject (tela
de login) — não existe mais uma chave única compartilhada configurada no
servidor. Isso faz o SmartFlow enxergar exatamente o que a conta de cada
usuário enxerga no OpenProject (permissões/visibilidade reais, por pessoa).

## Requisitos

- Python 3.10+
- Node.js 18+ (para buildar/rodar o frontend React)
- Acesso a uma instância do OpenProject (cada usuário gera sua própria API
  key em **My account → Access tokens → API key**, dentro do próprio
  OpenProject — ou acessando `/my/access_token` direto)

## Configuração (`.env`)

O backend lê configuração de um arquivo `.env` na raiz do projeto (não
versionado — já está no `.gitignore`). Use o `.env.example` como base:

```bash
cp .env.example .env
```

E preencha:

```
OPENPROJECT_URL=https://openproject.smartbr.com
```

- `OPENPROJECT_URL`: URL base da instância do OpenProject (sem `/` no
  final) — a mesma pra todo mundo, usada só pra saber com qual servidor
  falar. A API key em si **não** fica no `.env`: cada sessão de login carrega
  a sua própria, criptografada dentro do cookie do próprio navegador
  (`backend/sessions.py`), nunca em disco/banco no servidor.
- `DATABASE_URL`: connection string do Postgres onde fica a agenda (uma
  tabela `schedule_entries`, isolada por `user_id`). Provider gerenciado
  (Neon/Supabase/Railway Postgres) fornece pronto — não precisa instalar
  Postgres localmente.
- `SESSION_SECRET_KEY`: chave Fernet que criptografa o cookie de sessão. Gere
  com `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
  Trocar essa chave em produção derruba todas as sessões ativas (todo mundo
  precisa logar de novo).

Sem `OPENPROJECT_URL`, `DATABASE_URL` ou `SESSION_SECRET_KEY` o backend falha
ao iniciar (`os.environ[...]` levanta `KeyError` de propósito, pra não subir
silenciosamente sem configuração).

Opcionalmente, pra usar o botão **"Resolver com IA"** (manda a task direto
pra API da Claude):

```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5   # opcional, esse é o padrão
```

- `ANTHROPIC_API_KEY`: gere em
  [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
- Sem essa variável o resto do app funciona normal — só esse botão específico
  devolve erro 503 (`ANTHROPIC_API_KEY não configurada no backend`). O botão
  **"Copiar prompt IA"** (que só copia o texto pra área de transferência, sem
  chamar nenhuma API) continua funcionando sem chave nenhuma.

## Rodando (produção local — build + serve)

```bash
./run.sh
```

Cria o `.venv` e instala dependências Python na primeira vez, builda o React
(se `frontend-react/dist` não existir) e sobe o backend, que já serve o
build. Depois abra **http://127.0.0.1:8811**.

Para forçar rebuild do frontend: `./run.sh --build`.

## Rodando em background (systemd)

`./run.sh` roda em foreground — fecha o terminal, o processo morre. Pra
manter rodando em background, sobrevivendo a reboot e reiniciando sozinho se
cair, use um serviço systemd.

Crie `/etc/systemd/system/openassistent.service`:

```ini
[Unit]
Description=OpenAssistent
After=network.target

[Service]
WorkingDirectory=/home/operador/openassistent
ExecStart=/home/operador/openassistent/run.sh
Restart=on-failure
User=operador

[Install]
WantedBy=multi-user.target
```

Ative:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now openassistent
```

Comandos do dia a dia:

```bash
sudo systemctl status openassistent    # ver status
sudo systemctl restart openassistent   # reiniciar (ex.: após deploy)
sudo systemctl stop openassistent      # parar
journalctl -u openassistent -f         # logs em tempo real
```

Sempre que o arquivo `.service` for alterado, rode `sudo systemctl
daemon-reload` antes do `restart` — senão o systemd continua usando a versão
antiga carregada em memória e avisa "unit file ... changed on disk".

### Redeploy (após atualizar o código)

```bash
./redeploy.sh
```

Rebuilda o frontend React e reinicia o serviço systemd. Se o `requirements.txt`
mudou (dependência Python nova), instale antes — o `redeploy.sh` não faz isso
sozinho:

```bash
.venv/bin/pip install -r requirements.txt
```

Sem isso o backend quebra no import ao reiniciar.

## Rodando em modo desenvolvimento (hot reload)

```bash
./dev.sh
```

Sobe o backend com `--reload` na 8811 e o Vite dev server na 5173 (com proxy
de `/api` para o backend). Abra **http://127.0.0.1:5173** — mudanças no React
aparecem na hora.

## Deploy (produção remota)

O app roda como **um serviço só**, via `Dockerfile` na raiz — backend
FastAPI servindo a API e o build do React no mesmo host/porta (same-origin:
sem CORS cross-site, cookie de sessão funciona igual ao ambiente local).

1. Suba um Postgres gerenciado (Neon, Supabase, ou o addon Postgres do
   próprio host de deploy) e pegue a `DATABASE_URL`.
2. Gere `SESSION_SECRET_KEY` (comando na seção de Configuração acima).
3. Escolha um host que builda a partir de `Dockerfile` (Railway, Render, Fly.io
   — qualquer um funciona igual, é só apontar pro repo/Dockerfile).
4. Configure as env vars no host: `OPENPROJECT_URL`, `DATABASE_URL`,
   `SESSION_SECRET_KEY`, e opcionalmente `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`.
5. Deploy. O container builda o frontend (stage Node) e sobe o backend
   (`uvicorn`) na porta que o host injetar via `$PORT`.

Vercel fica de fora dessa: o app não é uma SPA + functions serverless
separadas — é um backend com estado de sessão por request, e Vercel Python
functions têm limite curto de execução e não foram desenhadas pra esse
formato. Um host que roda container Python normal (Railway/Render/Fly)
encaixa direto sem reescrever nada.

## Notificações do navegador mostrando IP em vez do nome

Acessando por `http://127.0.0.1:8811`, o Chrome/Edge mostra `127.0.0.1:8811`
embaixo do título da notificação nativa — é o navegador exibindo a origem
por segurança, não dá pra sobrescrever isso via código. Solução: acessar por
um hostname em vez do IP puro.

1. Adicione uma entrada no `/etc/hosts` apontando um nome pro localhost:

   ```bash
   echo "127.0.0.1 better-openproject.local" | sudo tee -a /etc/hosts
   ```

2. Acesse a aplicação por **http://better-openproject.local:8811** (produção,
   via `run.sh`) ou **http://better-openproject.local:5173** (dev, via
   `dev.sh`) em vez do IP.

3. Pronto — a notificação do navegador passa a mostrar
   `better-openproject.local` em vez de `127.0.0.1:8811`. O nome do app já
   vem correto no título (`SmartFlow`) desde `showBrowserNotification`
   em `frontend-react/src/App.jsx`; só a origem embaixo depende do hostname.

CORS do backend já está com `allow_origins=["*"]`
(`backend/main.py`), então trocar de IP pra hostname não quebra nada.

## O que tem

- **Board Kanban em React**: colunas por status, cards com badge de prioridade,
  progresso, datas e chip de atraso.
- **Drag-and-drop animado** (dnd-kit + framer-motion): arraste o card entre
  colunas com overlay suave; a mudança é otimista na UI e confirmada contra o
  workflow real do OpenProject.
- **Transição de status em múltiplos passos**: o workflow do OpenProject
  costuma exigir passar por status intermediários (ex.: `Nova → Backlog →
  Backlog-Pronto → Tarefa-Pronta → Desenvolvendo`) — não dá pra saltar
  direto entre alguns status. O backend resolve isso sozinho: ao arrastar um
  card, ele avança automaticamente por todos os status intermediários
  necessários (consultando a cada passo quais transições o workflow permite)
  até chegar no status de destino. Do ponto de vista do front, é só um
  drag-and-drop — se não houver caminho possível, o card volta e mostra quais
  status são realmente permitidos a partir do atual. Veja
  `OpenProjectClient.move_work_package_status` em `backend/op_client.py`.
- **Dark/Light mode**: botão no topo, com detecção da preferência do sistema e
  persistência em `localStorage`.
- **Editar datas**: clique no card para abrir o painel e editar data de
  início e prazo (dueDate).
- **Comentários**: adicione anotações que viram comentários (activities) reais
  no work package, e veja o histórico de comentários existentes.
- **Filtro "só as minhas"**: liga/desliga para ver todas as tasks visíveis ou
  só as atribuídas a você.

## Estrutura

- `backend/op_client.py` — cliente HTTP fino para a API v3 do OpenProject
  (Basic Auth: usuário `apikey`, senha = a API key pessoal de quem logou).
- `backend/sessions.py` — sessão de login: valida a API key digitada contra
  `/users/me` e devolve um cookie httpOnly criptografado (Fernet) com a key +
  dados do usuário — stateless, nenhum estado guardado em memória do
  servidor, funciona igual com uma ou várias instâncias do backend.
  - Transições de status válidas vêm do endpoint `/work_packages/{id}/form`
    (respeita o workflow por papel de usuário).
  - `move_work_package_status` faz a transição em múltiplos passos quando o
    salto direto não é permitido pelo workflow.
- `backend/schedule_db.py` — persistência (Postgres/asyncpg) da Agenda,
  tabela `schedule_entries` isolada por `user_id`: cada pessoa só lê/edita a
  própria.
- `backend/main.py` — FastAPI expondo endpoints simplificados
  (`/api/work_packages`, `/api/work_packages/{id}/status`,
  `/api/work_packages/{id}/dates`, `/api/work_packages/{id}/comments`, etc.)
  e servindo o build do frontend React (`frontend-react/dist`).
- `frontend-react/` — app React (Vite):
  - `src/components/Board.jsx` / `Column.jsx` / `Card.jsx` — Kanban com dnd-kit.
  - `src/components/WorkPackageModal.jsx` — painel de datas e comentários.
  - `src/ThemeContext.jsx` — dark/light mode via CSS custom properties.
  - `src/api.js` — cliente fetch para o backend.
- `frontend/` — versão anterior (HTML/JS puro), mantida como fallback caso
  `frontend-react/dist` não exista.
- `.env.example` — modelo de configuração; copie para `.env` e preencha com
  suas credenciais reais (não versionar `.env`).

## Próximos passos possíveis

- Criar novas work packages pelo board.
- Editar mais campos (responsável, prioridade, % concluído).
- Suporte a múltiplos projetos/filtros salvos.
- Notificações/atualização automática (polling ou websockets).
