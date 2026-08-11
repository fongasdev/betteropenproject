import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board from "./components/Board.jsx";
import WorkPackageModal from "./components/WorkPackageModal.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import PaletteSwitcher from "./components/PaletteSwitcher.jsx";
import Toaster from "./components/Toaster.jsx";
import NotificationCenter from "./components/NotificationCenter.jsx";
import ProjectFilter from "./components/ProjectFilter.jsx";
import StatusFilter from "./components/StatusFilter.jsx";
import TypeFilter from "./components/TypeFilter.jsx";
import ConfigVisibilityMenu, { loadVisibleConfigs } from "./components/ConfigVisibilityMenu.jsx";
import AgendaView from "./components/AgendaView.jsx";
import { api } from "./api.js";
import { initials, requestNotificationPermission, showBrowserNotification, playNotificationSound } from "./utils.js";
import { useTaskWatcher } from "./useTaskWatcher.js";

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

export default function App() {
  const [me, setMe] = useState(null);
  const [statuses, setStatuses] = useState([]);
  const [workPackages, setWorkPackages] = useState([]);
  const [onlyMe, setOnlyMe] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openWp, setOpenWp] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState(loadSelectedProjects);
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("op-sound") !== "off");
  const [pingedIds, setPingedIds] = useState(new Set());
  const [collapsedIds, setCollapsedIds] = useState(loadCollapsedCards);
  const [selectedStatuses, setSelectedStatuses] = useState(loadSelectedStatuses);
  const [selectedTypes, setSelectedTypes] = useState(loadSelectedTypes);
  const [layout, setLayout] = useState(loadLayout);
  const [resetToken, setResetToken] = useState(null);
  const [notifications, setNotifications] = useState(loadNotifications);
  const [openProjectUrl, setOpenProjectUrl] = useState(null);
  const [visibleConfigs, setVisibleConfigs] = useState(loadVisibleConfigs);
  const [collapsedColumns, setCollapsedColumns] = useState(loadCollapsedColumns);
  const [hideEmptyColumns, setHideEmptyColumns] = useState(loadHideEmptyColumns);
  const [activeView, setActiveView] = useState("board");

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
    showBrowserNotification("Better OpenProject","Notificação de teste — se você viu/ouviu isso, está tudo certo.");
    notify("Notificação de teste disparada", "info");
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

  const visibleWorkPackages = useMemo(() => {
    return workPackages.filter((w) => {
      if (selectedProjects.size > 0 && !selectedProjects.has(w.project)) return false;
      if (selectedTypes.size > 0 && !selectedTypes.has(w.type)) return false;
      return true;
    });
  }, [workPackages, selectedProjects, selectedTypes]);


  // Watcher: roda a cada 60s observando TODAS as minhas tarefas (independente
  // dos filtros visuais) e avisa com som quando outra pessoa comenta ou muda status.
  const handleWatcherEvents = useCallback(
    (events) => {
      const ids = new Set();
      events.forEach((ev) => {
        ids.add(ev.wp.id);
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
          showBrowserNotification("Better OpenProject",message);
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
      notify(`#${wp.id} movido para "${targetStatus.name}"`, "success");
    } catch (e) {
      notify(e.message || "Falha ao mover card", "error");
      setWorkPackages(prevWps);
    }
  }

  // Redefine visualização: volta colunas pra ordem padrão de status (nova,
  // backlog, backlog pronto...) e expande todos os cards recolhidos.
  function handleResetView() {
    setCollapsedIds(new Set());
    setCollapsedColumns(new Set());
    setResetToken(Date.now());
    notify("Visualização redefinida para o padrão", "info");
  }

  function handleOpenFromNotification(wpId) {
    const wp = workPackages.find((w) => w.id === wpId);
    if (wp) setOpenWp(wp);
  }

  function handleDatesSaved(wpId, patch) {
    setWorkPackages((list) => list.map((w) => (w.id === wpId ? { ...w, ...patch } : w)));
    setOpenWp((cur) => (cur && cur.id === wpId ? { ...cur, ...patch } : cur));
  }

  return (
    <div className="app">
      <header className="topbar">
        <ConfigVisibilityMenu visible={visibleConfigs} onChange={setVisibleConfigs} />

        <div className="view-tabs">
          <button
            className={`view-tab${activeView === "board" ? " active" : ""}`}
            onClick={() => setActiveView("board")}
          >
            Board
          </button>
          <button
            className={`view-tab${activeView === "agenda" ? " active" : ""}`}
            onClick={() => setActiveView("agenda")}
          >
            Agenda
          </button>
        </div>

        <div className="topbar-right">
          {activeView === "board" && visibleConfigs.has("projectFilter") && (
            <ProjectFilter
              projects={projectNames}
              selected={selectedProjects}
              onChange={setSelectedProjects}
            />
          )}

          {activeView === "board" && visibleConfigs.has("statusFilter") && (
            <StatusFilter
              statuses={statusNames}
              selected={selectedStatuses}
              onChange={setSelectedStatuses}
            />
          )}

          {activeView === "board" && visibleConfigs.has("typeFilter") && (
            <TypeFilter types={typeNames} selected={selectedTypes} onChange={setSelectedTypes} />
          )}

          {activeView === "board" && visibleConfigs.has("layoutToggle") && (
            <button
              className="icon-btn"
              onClick={() => setLayout((v) => (v === "horizontal" ? "vertical" : "horizontal"))}
              title="Alternar layout do board"
            >
              {layout === "horizontal" ? "↕ Vertical" : "↔ Horizontal"}
            </button>
          )}

          {activeView === "board" && visibleConfigs.has("resetView") && (
            <button
              className="icon-btn"
              onClick={handleResetView}
              title="Restaura a ordem padrão das colunas e expande todos os cards"
            >
              ↺ Redefinir visualização
            </button>
          )}

          {activeView === "board" && visibleConfigs.has("hideEmptyColumns") && (
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
        </div>
      </header>

      {activeView === "agenda" ? (
        <AgendaView workPackages={workPackages} />
      ) : loading && workPackages.length === 0 ? (
        <div className="loading-wrap">
          <span className="spinner" />
          Carregando tasks...
        </div>
      ) : (
        <Board
          statuses={statuses}
          workPackages={visibleWorkPackages}
          onOpenCard={setOpenWp}
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

      {openWp && (
        <WorkPackageModal
          wp={openWp}
          onClose={() => setOpenWp(null)}
          onDatesSaved={handleDatesSaved}
          notify={notify}
          openProjectUrl={openProjectUrl}
        />
      )}

      <Toaster toasts={toasts} />

      <span className="app-brand-watermark">Better OpenProject</span>
    </div>
  );
}
