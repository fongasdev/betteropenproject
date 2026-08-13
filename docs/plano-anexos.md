# Plano — Anexos e imagens do OpenProject no SmartFlow

Status: **planejamento apenas, nada implementado**. Documenta como recuperar e
exibir com segurança os anexos (imagens/arquivos) que hoje só existem "do
lado" do OpenProject.

## O que já foi confirmado (investigação na API real)

- Cada work package expõe `_links.attachments.href` →
  `GET /api/v3/work_packages/{id}/attachments`, que lista os anexos com
  `fileName`, `contentType`, `fileSize`, `author`, `createdAt` e
  `_links.staticDownloadLocation.href` (`/api/v3/attachments/{id}/content`).
- O conteúdo do anexo (`GET /api/v3/attachments/{id}/content`) **exige** a
  mesma autenticação Basic (`apikey`/API key) usada em todo o resto da API —
  sem auth, devolve `401`. Não é uma URL pré-assinada pública.
- Imagens coladas em comentários/descrição (CKEditor) aparecem como
  `<img class="op-uc-image..." src="/api/v3/attachments/{id}/content">` —
  **caminho relativo ao domínio do OpenProject**. Já existem casos reais assim
  na base atual (ex.: work package #2894).
- Também existem imagens hospedadas fora do OpenProject (ex.: CDN do Discord,
  colada como link direto) — essas já funcionam hoje sem nenhuma mudança,
  porque não dependem de autenticação nem do domínio do OP.

**Consequência importante:** o sanitizador de histórico implementado no item
2 desta entrega deixa `src="/api/v3/..."` passar por ser um caminho relativo
"seguro", mas como o SmartFlow roda em outro domínio, esse caminho relativo
resolve contra o **próprio domínio do SmartFlow** (que não tem essa rota) —
a imagem quebra. Esse plano é o que resolve esse caso.

## 1. Identificar e recuperar os anexos

- Backend já tem um client autenticado (`op_client.client`) reutilizável.
  Adicionar métodos:
  - `list_attachments(wp_id)` → proxy de `GET /work_packages/{id}/attachments`.
  - `get_attachment_meta(attachment_id)` → `GET /attachments/{id}` (nome,
    tipo, tamanho — pra montar cabeçalhos de download corretos).
  - `stream_attachment_content(attachment_id)` → `GET
    /attachments/{id}/content`, repassado como stream (não carregar arquivo
    inteiro em memória — usar `httpx` em modo stream + `StreamingResponse` do
    FastAPI).

## 2. Expor com segurança no SmartFlow (proxy no backend)

- Novo endpoint `GET /api/attachments/{attachment_id}` no `backend/main.py`,
  que:
  1. Busca metadados (nome/tipo) via `op_client`.
  2. Faz stream do conteúdo do OpenProject usando a API key do **servidor**
     (a mesma já usada em todas as outras chamadas) — a key nunca é exposta
     ao navegador, só o backend fala com o OpenProject.
  3. Repassa `Content-Type` da OP; define `Content-Disposition` — `inline`
     para imagens (renderização direta), `attachment` para os demais tipos
     (força download em vez de tentar abrir no navegador, evitando risco de
     um HTML/SVG malicioso hospedado como anexo rodar no contexto do
     SmartFlow).
  4. Cache-Control de longa duração (`immutable`) — um anexo com o mesmo id
     nunca muda de conteúdo no OpenProject (reupload gera novo id).
- Modelo de permissão: o SmartFlow inteiro já opera com **uma única API key
  de serviço** — quem acessa o SmartFlow já vê tudo que essa key enxerga
  (comentários, work packages, agora anexos). Não há hoje verificação de
  permissão por usuário individual (nem para comentários/status). O proxy de
  anexos mantém exatamente esse mesmo modelo de confiança — não introduz
  exposição nova. Se no futuro for necessário granularidade por usuário
  (alguém no SmartFlow não devendo ver certo anexo que também não veria no
  OP), isso exigiria trocar a autenticação de "API key única" por
  "token por usuário" (OAuth2 do OpenProject) — mudança bem maior, fora do
  escopo deste plano.

## 3. Renderizar imagens inline

- No sanitizador de histórico (`richContent.js`, já usado no item 2), ao
  processar `<img>`:
  - Se `src` for um caminho relativo do OpenProject
    (`/api/v3/attachments/{id}/content`) ou uma URL absoluta apontando pro
    domínio do OpenProject (`OPENPROJECT_URL + /api/v3/attachments/...`),
    **reescrever** para `/api/attachments/{id}` (o proxy do próprio
    SmartFlow) antes de inserir no DOM.
  - Se for uma URL externa de terceiros (já funciona hoje), deixar como está.
- Mesma reescrita se aplica à descrição da task (também vem em HTML rico,
  hoje não renderizada como tal — ficaria coberta junto se/quando a
  descrição também passar a ser exibida via `sanitizeRichHtml`).

## 4. Disponibilizar outros arquivos (não-imagem) para visualização/download

- Nova seção "Anexos" no modal de task / aba de task (`WorkPackageModal` /
  `TaskTabPanel`), abaixo do histórico:
  - Lista os anexos do work package (via novo `api.attachments(wpId)` →
    `GET /api/work_packages/{id}/attachments`).
  - Cada item mostra ícone por tipo, nome, tamanho, e um link
    `<a href="/api/attachments/{id}" target="_blank">` — PDFs/imagens abrem
    numa aba nova, outros tipos disparam download nativo do navegador
    (por causa do `Content-Disposition: attachment` no proxy).

## 5. Impactos de autenticação, permissão e URLs

- **Autenticação:** nenhuma mudança no modelo atual — o backend continua
  sendo o único que fala com o OpenProject, usando a API key do `.env`.
- **Permissão:** ver item 2 — mesma granularidade "tudo ou nada" que já
  existe hoje pro resto do app.
- **URLs:** anexos passam a ter uma URL estável e própria do SmartFlow
  (`/api/attachments/{id}`), nunca a URL real do OpenProject — evita
  vazar a API key (que hoje viaja como parte da autenticação Basic, nunca
  na URL, mas ainda assim mantém o domínio/infra do OP fora do frontend).
- **Segurança de conteúdo:** forçar `Content-Disposition: attachment` pra
  tipos não confiáveis (qualquer coisa que não seja imagem/PDF já
  whitelistado) evita que um arquivo malicioso anexado no OpenProject execute
  no contexto (origin) do SmartFlow.
- **Performance:** streaming evita carregar arquivos grandes inteiros na
  memória do backend; cache longo no proxy evita re-buscar o mesmo anexo do
  OpenProject a cada visualização.

## Ordem sugerida de implementação (quando for a hora)

1. `op_client`: métodos de listagem/stream de anexos.
2. `backend/main.py`: endpoints `GET /api/work_packages/{id}/attachments` e
   `GET /api/attachments/{id}`.
3. `richContent.js`: reescrita de `src` de imagens do OpenProject pro proxy.
4. `WorkPackageModal`/`TaskTabPanel`: seção "Anexos" com a lista.
5. Validar com uma task real que já tem anexo (ex.: #2894, que já tem duas
   imagens coladas em comentários) — imagem deve renderizar inline e não
   mais quebrar.
