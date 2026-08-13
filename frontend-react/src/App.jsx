import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "./components/Board.jsx";
import TaskTabPanel from "./components/TaskTabPanel.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import PaletteSwitcher from "./components/PaletteSwitcher.jsx";
import Toaster from "./components/Toaster.jsx";
import NotificationCenter from "./components/NotificationCenter.jsx";
import ProjectFilter from "./components/ProjectFilter.jsx";
import StatusFilter from "./components/StatusFilter.jsx";
import TypeFilter from "./components/TypeFilter.jsx";
import PriorityFilter from "./components/PriorityFilter.jsx";
import ConfigVisibilityMenu, { loadVisibleConfigs } from "./components/ConfigVisibilityMenu.jsx";
import AgendaView from "./components/AgendaView.jsx";
import QuickSearch from "./components/QuickSearch.jsx";
import { APP_VERSION, APP_VERSION_DATE } from "./version.js";
import { api } from "./api.js";
import { initials, requestNotificationPermission, showBrowserNotification, playNotificationSound } from "./utils.js";
import { useTaskWatcher } from "./useTaskWatcher.js";
import { wpCache } from "./wpCache.js";

let toastSeq = 0;
let notifSeq = 0;
const NOTIF_LIMIT = 100;

// Central de notificações persistida (localStorage), pra sobreviver a reload
// e a notificações do navegador fechadas — igual histórico do OpenProject.
function loadNotifications() {
  try {
    const raw = localStorage.getItem("op-notifications");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// IDs de notificações nativas do OpenProject já trazidas pra cá — evita
// renotificar a mesma coisa a cada poll enquanto ela seguir não lida lá.
function loadSeenOpNotifications() {
  try {
    const raw = localStorage.getItem("op-seen-native-notifications");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

const OP_NOTIFICATION_REASON_LABEL = {
  mentioned: "mencionou você",
  assigned: "atribuiu a tarefa a você",
  responsible: "te tornou responsável",
  accountable: "te tornou responsável",
  watched: "atualizou uma tarefa que você observa",
  commented: "comentou",
  dateAlert: "alerta de prazo",
  overdue: "está atrasada",
  processed: "atualizou o status",
  scheduled: "agendou",
  shared: "compartilhou algo com você",
};

function loadSelectedProjects() {
  try {
    const raw = localStorage.getItem("op-selected-projects");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function loadCollapsedCards() {
  try {
    const raw = localStorage.getItem("op-collapsed-cards");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function loadSelectedStatuses() {
  try {
    const raw = localStorage.getItem("op-selected-statuses");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function loadSelectedTypes() {
  try {
    const raw = localStorage.getItem("op-selected-types");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function loadSelectedPriorities() {
  try {
    const raw = localStorage.getItem("op-selected-priorities");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

function loadLayout() {
  const v = localStorage.getItem("op-layout");
  return v === "vertical" ? "vertical" : "horizontal";
}

function loadHideEmptyColumns() {
  return localStorage.getItem("op-hide-empty-columns") === "on";
}

function loadCollapsedColumns() {
  try {
    const raw = localStorage.getItem("op-collapsed-columns");
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (e) {
    return new Set();
  }
}

export default function App({ onLogout }) {
  const [me, setMe] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [workPackages, setWorkPackages] = useState([]);
  const [onlyMe, setOnlyMe] = useState(true);
  const [loading, setLoading] = useState(true);
  // Abas de tarefa abertas — cada uma guarda só o essencial pra render do
  // rótulo (id/subject); o conteúdo completo é buscado via wpCache (cache
  // stale-while-revalidate) quando a aba fica ativa, igual o modal já fazia.
  const [taskTabs, setTaskTabs] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState(loadSelectedProjects);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("op-sound") !== "off");
  const [pingedIds, setPingedIds] = useState(new Set());
  const [collapsedIds, setCollapsedIds] = useState(loadCollapsedCards);
  const [selectedStatuses, setSelectedStatuses] = useState(loadSelectedStatuses);
  const [selectedTypes, setSelectedTypes] = useState(loadSelectedTypes);
  const [selectedPriorities, setSelectedPriorities] = useState(loadSelectedPriorities);
  const [layout, setLayout] = useState(loadLayout);
  const [resetToken, setResetToken] = useState(null);
  const [notifications, setNotifications] = useState(loadNotifications);
  const [openProjectUrl, setOpenProjectUrl] = useState(null);
  const [visibleConfigs, setVisibleConfigs] = useState(loadVisibleConfigs);
  const [collapsedColumns, setCollapsedColumns] = useState(loadCollapsedColumns);
  const [hideEmptyColumns, setHideEmptyColumns] = useState(loadHideEmptyColumns);
  // "board" | "agenda" | <wpId numérico> — aba ativa. Board e Agenda são
  // fixas; tasks abertas viram abas próprias e fecháveis.
  const [activeTab, setActiveTab] = useState("board");

  useEffect(() => {
    api.config().then((c) => setOpenProjectUrl(c.openProjectUrl)).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem("op-notifications", JSON.stringify(notifications.slice(0, NOTIF_LIMIT)));
  }, [notifications]);

  // notify(): mostra o toast passageiro E guarda na central de notificações
  // (persistida), pra ficar disponível mesmo se a notificação do navegador
  // for fechada ou perdida.
  const notify = useCallback((message, kind = "success", opts = {}) => {
    const toastId = ++toastSeq;
    setToasts((t) => [...t, { id: toastId, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toastId)), 3200);

    const notifId = ++notifSeq;
    setNotifications((list) =>
      [
        { id: `${Date.now()}-${notifId}`, message, kind, createdAt: new Date().toISOString(), read: false, wpId: opts.wpId ?? null },
        ...list,
      ].slice(0, NOTIF_LIMIT)
    );
  }, []);

  function markAllNotificationsRead() {
    setNotifications((list) => list.map((n) => (n.read ? n : { ...n, read: true })));
  }

  function clearNotifications() {
    setNotifications([]);
  }

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [meData, statusesData, wpData] = await Promise.all([
        me ? Promise.resolve(me) : api.me(),
        api.statuses(),
        api.workPackages(onlyMe),
      ]);
      setMe(meData);
      setStatuses(statusesData);
      setWorkPackages(wpData);
      // Aquece o cache de tasks relacionadas (histórias vinculadas etc.) em
      // background — não trava a tela, só deixa a navegação fluida quando o
      // usuário abrir um card depois.
      wpCache.prefetchParents(wpData);
    } catch (e) {
      notify(e.message || "Falha ao carregar dados", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyMe]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    localStorage.setItem("op-selected-projects", JSON.stringify([...selectedProjects]));
  }, [selectedProjects]);

  useEffect(() => {
    localStorage.setItem("op-sound", soundOn ? "on" : "off");
    if (soundOn) requestNotificationPermission();
  }, [soundOn]);

  useEffect(() => {
    localStorage.setItem("op-collapsed-cards", JSON.stringify([...collapsedIds]));
  }, [collapsedIds]);

  useEffect(() => {
    localStorage.setItem("op-selected-statuses", JSON.stringify([...selectedStatuses]));
  }, [selectedStatuses]);

  useEffect(() => {
    localStorage.setItem("op-selected-types", JSON.stringify([...selectedTypes]));
  }, [selectedTypes]);

  useEffect(() => {
    localStorage.setItem("op-selected-priorities", JSON.stringify([...selectedPriorities]));
  }, [selectedPriorities]);

  useEffect(() => {
    localStorage.setItem("op-layout", layout);
  }, [layout]);

  useEffect(() => {
    localStorage.setItem("op-visible-configs", JSON.stringify([...visibleConfigs]));
  }, [visibleConfigs]);

  useEffect(() => {
    localStorage.setItem("op-collapsed-columns", JSON.stringify([...collapsedColumns]));
  }, [collapsedColumns]);

  useEffect(() => {
    localStorage.setItem("op-hide-empty-columns", hideEmptyColumns ? "on" : "off");
  }, [hideEmptyColumns]);

  const toggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleColumnCollapse = useCallback((statusName) => {
    setCollapsedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(statusName)) next.delete(statusName);
      else next.add(statusName);
      return next;
    });
  }, []);

  function handleEnableNotifications() {
    requestNotificationPermission();
    setSoundOn(true);
    notify("Notificações ativadas neste navegador", "success");
  }

  function handleTestNotification() {
    playNotificationSound();
    showBrowserNotification("SmartFlow","Notificação de teste — se você viu/ouviu isso, está tudo certo.");
    notify("Notificação de teste disparada", "info");
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch (e) {
      /* mesmo se falhar, derruba a sessão local — cookie expira sozinho */
    }
    onLogout?.();
  }

  const projectNames = useMemo(() => {
    const set = new Set(workPackages.map((w) => w.project).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [workPackages]);

  const statusNames = useMemo(() => {
    const set = new Set(statuses.map((s) => s.name));
    workPackages.forEach((w) => w.status && set.add(w.status));
    return [...set];
  }, [statuses, workPackages]);

  const typeNames = useMemo(() => {
    const set = new Set(workPackages.map((w) => w.type).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [workPackages]);

  const priorityNames = useMemo(() => {
    const set = new Set(workPackages.map((w) => w.priority).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [workPackages]);

  const visibleWorkPackages = useMemo(() => {
    return workPackages.filter((w) => {
      if (selectedProjects.size > 0 && !selectedProjects.has(w.project)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(w.type)) return false;
      if (selectedPriorities.size > 0 && !selectedPriorities.has(w.priority)) return false;
      return true;
    });
  }, [workPackages, selectedProjects, selectedTypes, selectedPriorities]);

  // Agenda não usa os filtros de projeto/tipo do Board (botões não aparecem
  // nessa view), só o de prioridade — que faz sentido em qualquer listagem.
  const agendaWorkPackages = useMemo(() => {
    if (selectedPriorities.size === 0) return workPackages;
    return workPackages.filter((w) => selectedPriorities.has(w.priority));
  }, [workPackages, selectedPriorities]);


  // Watcher: roda a cada 60s observando TODAS as minhas tarefas (independente
  // dos filtros visuais) e avisa com som quando outra pessoa comenta ou muda status.
  const handleWatcherEvents = useCallback(
    (events) => {
      const ids = new Set();
      events.forEach((ev) => {
        ids.add(ev.wp.id);
        // Task mudou (status/comentário) — descarta cache pra não servir
        // versão velha se ela aparecer como "task relacionada" em outra.
        wpCache.invalidate(ev.wp.id);
        const who = ev.activity?.user || "alguém";
        let message = null;
        if (ev.type === "status") {
          message = `#${ev.wp.id} "${ev.wp.subject}" — ${who} mudou o status para "${ev.wp.status}"`;
        } else if (ev.type === "comment") {
          message = `#${ev.wp.id} "${ev.wp.subject}" — novo comentário de ${who}`;
        } else if (ev.type === "assigned") {
          message = `Nova tarefa atribuída a você: #${ev.wp.id} "${ev.wp.subject}"`;
        }
        if (message) {
          notify(message, "info", { wpId: ev.wp.id });
          showBrowserNotification("SmartFlow",message);
        }
      });
      setPingedIds((prev) => new Set([...prev, ...ids]));
      ids.forEach((id) => {
        setTimeout(() => {
          setPingedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, 20000);
      });
      // refaz a carga do board para refletir o novo status/dados
      loadAll();
    },
    [notify, loadAll]
  );

  useTaskWatcher({ me, enabled: soundOn, onEvents: handleWatcherEvents });

  // Puxa as notificações nativas do OpenProject (menções, atribuições,
  // alertas de data etc. — o sininho de lá) e injeta as ainda não vistas
  // aqui na central local, além do que o watcher já gera sozinho.
  const seenOpNotifIdsRef = useRef(loadSeenOpNotifications());

  const pollOpenProjectNotifications = useCallback(async () => {
    let list;
    try {
      list = await api.notifications();
    } catch (e) {
      return; // falha pontual — tenta de novo no próximo ciclo
    }
    const unseen = list.filter((n) => !seenOpNotifIdsRef.current.has(n.id));
    if (unseen.length === 0) return;

    unseen.forEach((n) => {
      seenOpNotifIdsRef.current.add(n.id);
      const who = n.actor || "alguém";
      const action = OP_NOTIFICATION_REASON_LABEL[n.reason] || "tem uma notificação para você";
      const subject = n.wpSubject ? ` "${n.wpSubject}"` : "";
      const message = `#${n.wpId ?? "?"}${subject} — ${who} ${action} (OpenProject)`;
      notify(message, "info", { wpId: n.wpId ?? undefined });
    });

    localStorage.setItem(
      "op-seen-native-notifications",
      JSON.stringify([...seenOpNotifIdsRef.current].slice(-500))
    );
  }, [notify]);

  useEffect(() => {
    if (!me) return;
    pollOpenProjectNotifications();
    const id = setInterval(pollOpenProjectNotifications, 30_000);
    return () => clearInterval(id);
  }, [me, pollOpenProjectNotifications]);

  async function handleMove(wp, targetStatus) {
    const prevWps = workPackages;
    setWorkPackages((list) =>
      list.map((w) => (w.id === wp.id ? { ...w, status: targetStatus.name } : w))
    );
    try {
      // A troca de status pode exigir passos intermediários do workflow do
      // OpenProject (ex.: Desenvolvendo -> Finalizado passa por Testando e
      // Pendente-Review); quem resolve isso é o backend (move_work_package_status),
      // então não fazemos mais checagem de transição direta aqui no front.
      const updated = await api.changeStatus(wp.id, wp.lockVersion, targetStatus.id);
      setWorkPackages((list) =>
        list.map((w) =>
          w.id === wp.id
            ? { ...w, status: targetStatus.name, lockVersion: updated.lockVersion, updatedAt: updated.updatedAt }
            : w
        )
      );
      wpCache.invalidate(wp.id);
      notify(`#${wp.id} movido para "${targetStatus.name}"`, "success");
    } catch (e) {
      notify(e.message || "Falha ao mover card", "error");
      setWorkPackages(prevWps);
    }
  }

  // Comentário rápido a partir de fora do modal (ex.: Agenda) — mesma
  // chamada que o modal usa, só sem o estado local de textarea dele.
  async function handleAddComment(wpId, text) {
    await api.addComment(wpId, text);
    wpCache.invalidate(wpId);
    notify(`Comentário adicionado em #${wpId}`, "success");
  }

  // Redefine visualização: volta colunas pra ordem padrão de status (nova,
  // backlog, backlog pronto...) e expande todos os cards recolhidos.
  function handleResetView() {
    setCollapsedIds(new Set());
    setCollapsedColumns(new Set());
    setResetToken(Date.now());
    notify("Visualização redefinida para o padrão", "info");
  }

  // Abre (ou ativa, se já aberta) uma task na própria aba, com visão
  // expandida. `openedFrom` é a aba de onde a abertura partiu (board/agenda/
  // outra task) — usado só pelo botão "← Voltar" dentro da task.
  const openTaskTab = useCallback((wp, openedFrom) => {
    if (wp) wpCache.primeWorkPackage(wp);
    setTaskTabs((tabs) => {
      if (tabs.some((t) => t.id === wp.id)) return tabs;
      return [...tabs, { id: wp.id, subject: wp.subject, openedFrom: openedFrom ?? activeTab }];
    });
    setActiveTab(wp.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  function closeTaskTab(wpId) {
    setTaskTabs((tabs) => {
      const idx = tabs.findIndex((t) => t.id === wpId);
      if (idx === -1) return tabs;
      const closedTab = tabs[idx];
      const next = tabs.filter((t) => t.id !== wpId);
      setActiveTab((cur) => (cur === wpId ? closedTab.openedFrom ?? "board" : cur));
      return next;
    });
  }

  function handleOpenFromNotification(wpId) {
    const wp = workPackages.find((w) => w.id === wpId);
    if (wp) openTaskTab(wp);
  }

  function handleDatesSaved(wpId, patch) {
    setWorkPackages((list) => list.map((w) => (w.id === wpId ? { ...w, ...patch } : w)));
  }

  // Abre a task relacionada (ex.: história vinculada a uma tarefa) numa nova
  // aba, lembrando de onde veio pra dar pra voltar. Busca avulsa porque a
  // relacionada pode não estar na lista carregada (ex.: filtro "só as minhas").
  async function handleOpenRelated(wpId) {
    try {
      const fromList = workPackages.find((w) => w.id === wpId);
      const related = fromList || (await wpCache.loadWorkPackage(wpId));
      openTaskTab(related, activeTab);
    } catch (e) {
      notify(e.message || "Falha ao abrir task relacionada", "error");
    }
  }

  function handleOpenFromSearch(wp) {
    openTaskTab(wp);
  }

  return (
    <div className="app">
      <QuickSearch
        workPackages={workPackages}
        onOpenWp={handleOpenFromSearch}
        disabled={typeof activeTab === "number"}
      />

      <header className="topbar">
        <div className="topbar-brand" aria-label="SmartFlow">
          <img src="/favicon.svg" alt="" className="topbar-brand-logo" />
          <span className="topbar-brand-name" aria-hidden="true">martFlow</span>
        </div>

        <div className="view-tabs">
          <button
            className={`view-tab${activeTab === "board" ? " active" : ""}`}
            onClick={() => setActiveTab("board")}
          >
            Dashboard
          </button>
          <button
            className={`view-tab${activeTab === "agenda" ? " active" : ""}`}
            onClick={() => setActiveTab("agenda")}
          >
            Agenda
          </button>
        </div>

        <div className="topbar-right">
          {activeTab === "board" && visibleConfigs.has("projectFilter") && (
            <ProjectFilter
              projects={projectNames}
              selected={selectedProjects}
              onChange={setSelectedProjects}
            />
          )}

          {activeTab === "board" && visibleConfigs.has("statusFilter") && (
            <StatusFilter
              statuses={statusNames}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
            />
          )}

          {activeTab === "board" && visibleConfigs.has("typeFilter") && (
            <TypeFilter types={typeNames} selected={selectedTypes} onChange={setSelectedTypes} />
          )}

          {visibleConfigs.has("priorityFilter") && (
            <PriorityFilter
              priorities={priorityNames}
              selected={selectedPriorities}
              onChange={setSelectedPriorities}
            />
          )}

          {activeTab === "board" && visibleConfigs.has("layoutToggle") && (
            <button
              className="icon-btn"
              onClick={() => setLayout((v) => (v === "horizontal" ? "vertical" : "horizontal"))}
              title="Alternar layout do board"
            >
              {layout === "horizontal" ? "↕ Vertical" : "↔ Horizontal"}
            </button>
          )}

          {activeTab === "board" && visibleConfigs.has("resetView") && (
            <button
              className="icon-btn"
              onClick={handleResetView}
              title="Restaura a ordem padrão das colunas e expande todos os cards"
            >
              ↺ Redefinir visualização
            </button>
          )}

          {activeTab === "board" && visibleConfigs.has("hideEmptyColumns") && (
            <label className="switch-label">
              ocultar colunas vazias
              <span
                className="switch"
                data-on={hideEmptyColumns}
                onClick={() => setHideEmptyColumns((v) => !v)}
              >
                <span className="knob" />
              </span>
            </label>
          )}

          {visibleConfigs.has("onlyMe") && (
            <label className="switch-label">
              só as minhas
              <span className="switch" data-on={onlyMe} onClick={() => setOnlyMe((v) => !v)}>
                <span className="knob" />
              </span>
            </label>
          )}

          {visibleConfigs.has("soundToggle") && (
            <button
              className="icon-btn"
              onClick={() => setSoundOn((v) => !v)}
              title="Ativar/desativar notificação sonora"
            >
              {soundOn ? "🔔" : "🔕"}
            </button>
          )}

          {visibleConfigs.has("notificationCenter") && (
            <NotificationCenter
              notifications={notifications}
              onMarkAllRead={markAllNotificationsRead}
              onClear={clearNotifications}
              onOpenWp={handleOpenFromNotification}
            />
          )}

          {visibleConfigs.has("enableNotifications") && (
            <button className="icon-btn" onClick={handleEnableNotifications} title="Pede permissão do navegador e ativa notificações">
              Ativar notificações
            </button>
          )}

          {visibleConfigs.has("testNotification") && (
            <button className="icon-btn" onClick={handleTestNotification} title="Dispara uma notificação de teste (som + browser)">
              Testar
            </button>
          )}

          {visibleConfigs.has("reload") && (
            <button className="icon-btn" onClick={loadAll}>
              ⟳ Recarregar
            </button>
          )}

          {visibleConfigs.has("palette") && <PaletteSwitcher />}

          {visibleConfigs.has("theme") && <ThemeToggle />}

          {visibleConfigs.has("userChip") && me && (
            <div className="user-chip">
              <span className="avatar">{initials(me.name)}</span>
              <span>{me.name}</span>
            </div>
          )}

          <button className="icon-btn" onClick={handleLogout} title="Sair (encerra a sessão)">
            Sair
          </button>

          <ConfigVisibilityMenu visible={visibleConfigs} onChange={setVisibleConfigs} />
        </div>
      </header>

      {taskTabs.length > 0 && (
        <div className="task-tab-bar">
          {taskTabs.map((t) => (
            <button
              key={t.id}
              className={`task-chrome-tab${activeTab === t.id ? " active" : ""}`}
              onClick={() => setActiveTab(t.id)}
              title={t.subject}
            >
              <span className="task-chrome-tab-label">
                #{t.id} — {t.subject?.length > 22 ? `${t.subject.slice(0, 22)}…` : t.subject}
              </span>
              <span
                className="task-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTaskTab(t.id);
                }}
                title="Fechar aba"
              >
                ✕
              </span>
            </button>
          ))}
        </div>
      )}

      {typeof activeTab === "number" ? (
        (() => {
          const tab = taskTabs.find((t) => t.id === activeTab);
          if (!tab) return null;
          return (
            <TaskTabPanel
              wpId={tab.id}
              subjectHint={tab.subject}
              onClose={() => closeTaskTab(tab.id)}
              onDatesSaved={handleDatesSaved}
              notify={notify}
              openProjectUrl={openProjectUrl}
              onOpenRelated={handleOpenRelated}
              canGoBack={!!tab.openedFrom}
              onBack={() => setActiveTab(tab.openedFrom ?? "board")}
            />
          );
        })()
      ) : activeTab === "agenda" ? (
        <AgendaView
          workPackages={agendaWorkPackages}
          statuses={statuses}
          notify={notify}
          openProjectUrl={openProjectUrl}
          onChangeStatus={handleMove}
          onAddComment={handleAddComment}
        />
      ) : loading && workPackages.length === 0 ? (
        <div className="loading-wrap">
          <span className="spinner" />
          Carregando tasks...
        </div>
      ) : (
        <Board
          statuses={statuses}
          workPackages={visibleWorkPackages}
          onOpenCard={(wp) => openTaskTab(wp)}
          onMove={handleMove}
          pingedIds={pingedIds}
          collapsedIds={collapsedIds}
          onToggleCollapse={toggleCollapse}
          collapsedColumns={collapsedColumns}
          onToggleColumnCollapse={toggleColumnCollapse}
          selectedStatuses={selectedStatuses}
          hideEmptyColumns={hideEmptyColumns}
          layout={layout}
          resetToken={resetToken}
        />
      )}

      <Toaster toasts={toasts} />

      <span className="app-version-watermark">
        SmartFlow v{APP_VERSION} · {APP_VERSION_DATE}
      </span>
    </div>
  );
}
