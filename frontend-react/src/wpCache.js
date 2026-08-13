import { api } from "./api.js";

// Cache de work packages e comentários (atividades), estratégia
// stale-while-revalidate: a partir da 2ª visita mostra o que já está em
// memória na hora (rápido) e SEMPRE revalida contra o backend logo em
// seguida — se algo mudou (status, comentário novo, datas...) o dado é
// atualizado sozinho, sem o usuário precisar recarregar nada na mão.
//
// Como o OpenProject bumpa `updatedAt` do work package a cada mudança
// (inclusive comentário — é assim que o useTaskWatcher já detecta atividade
// nova), usamos isso como sinal de frescor: dentro do cooldown, nem revalida;
// depois dele, revalida em background sem travar a UI.

const wpStore = new Map(); // id -> { data, fetchedAt }
const activityStore = new Map(); // id -> { data, fetchedAt }
const inFlight = new Map(); // chave -> promise (evita corrida duplicada)

const REVALIDATE_COOLDOWN_MS = 15_000;
const PREFETCH_GAP_MS = 120; // espaçamento entre requisições do aquecimento em background

function peekWorkPackage(id) {
  return wpStore.get(id)?.data ?? null;
}

function peekActivities(id) {
  return activityStore.get(id)?.data ?? null;
}

function isFresh(entry) {
  return !!entry && Date.now() - entry.fetchedAt < REVALIDATE_COOLDOWN_MS;
}

function dedupe(key, fetcher) {
  if (inFlight.has(key)) return inFlight.get(key);
  const p = fetcher().finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function loadWorkPackage(id, { force = false } = {}) {
  const cached = wpStore.get(id);
  if (!force && isFresh(cached)) return cached.data;
  return dedupe(`wp:${id}`, () =>
    api.workPackage(id).then((data) => {
      wpStore.set(id, { data, fetchedAt: Date.now() });
      return data;
    })
  );
}

async function loadActivities(id, { force = false } = {}) {
  const cached = activityStore.get(id);
  if (!force && isFresh(cached)) return cached.data;
  return dedupe(`act:${id}`, () =>
    api.activities(id).then((data) => {
      activityStore.set(id, { data, fetchedAt: Date.now() });
      return data;
    })
  );
}

// Popula o cache com uma task que já foi carregada em outro lugar (ex.: card
// do board), evitando um fetch redundante ao abrir a mesma task numa aba.
function primeWorkPackage(data) {
  if (!data?.id) return;
  wpStore.set(data.id, { data, fetchedAt: Date.now() });
}

// Descarta o cache de uma task (usado quando o watcher percebe que ela mudou
// de status/ganhou comentário) — a próxima leitura busca dado novo na hora.
function invalidate(id) {
  wpStore.delete(id);
  activityStore.delete(id);
}

// Aquece o cache em background assim que a lista de tarefas carrega: busca a
// task pai de cada uma (a "história vinculada" etc.) devagar, uma de cada
// vez, pra já estar pronta quando o usuário clicar em "task relacionada" —
// sem disparar rajada de requisições nem travar o carregamento principal.
let prefetching = false;
async function prefetchParents(workPackages) {
  if (prefetching) return;
  prefetching = true;
  try {
    const ids = [...new Set((workPackages || []).map((w) => w.parentId).filter(Boolean))];
    for (const id of ids) {
      if (!isFresh(wpStore.get(id))) {
        try {
          await loadWorkPackage(id);
        } catch (e) {
          /* falha pontual — tenta de novo na próxima leva de prefetch */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, PREFETCH_GAP_MS));
    }
  } finally {
    prefetching = false;
  }
}

export const wpCache = {
  peekWorkPackage,
  peekActivities,
  loadWorkPackage,
  loadActivities,
  primeWorkPackage,
  invalidate,
  prefetchParents,
};
