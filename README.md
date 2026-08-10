# Meu Board — OpenProject

Frontend próprio (Kanban com drag-and-drop) para suas tasks no OpenProject,
usando a API v3 via API key. Frontend em **React** (Vite + dnd-kit +
framer-motion), backend em **FastAPI**, que atua como proxy simplificado
para a API do OpenProject.

## Requisitos

- Python 3.10+
- Node.js 18+ (para buildar/rodar o frontend React)
- Acesso a uma instância do OpenProject + uma API key

## Configuração (`.env`)

O backend lê credenciais de um arquivo `.env` na raiz do projeto (não
versionado — já está no `.gitignore`). Use o `.env.example` como base:

```bash
cp .env.example .env
```

E preencha as duas variáveis:

```
OPENPROJECT_URL=https://openproject.smartbr.com
OPENPROJECT_API_KEY=coloque_sua_api_key_aqui
```

- `OPENPROJECT_URL`: URL base da sua instância (sem `/` no final).
- `OPENPROJECT_API_KEY`: gere em **My account → Access tokens → API key**,
  dentro do próprio OpenProject. É usada como senha no Basic Auth (usuário
  fixo `apikey`), veja `backend/op_client.py`.

Sem essas duas variáveis o backend falha ao iniciar (`os.environ[...]`
levanta `KeyError` de propósito, pra não subir silenciosamente sem
credenciais).

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

## Rodando em modo desenvolvimento (hot reload)

```bash
./dev.sh
```

Sobe o backend com `--reload` na 8811 e o Vite dev server na 5173 (com proxy
de `/api` para o backend). Abra **http://127.0.0.1:5173** — mudanças no React
aparecem na hora.

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
  (Basic Auth: usuário `apikey`, senha = a API key).
  - Transições de status válidas vêm do endpoint `/work_packages/{id}/form`
    (respeita o workflow por papel de usuário).
  - `move_work_package_status` faz a transição em múltiplos passos quando o
    salto direto não é permitido pelo workflow.
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
# betteropenproject
