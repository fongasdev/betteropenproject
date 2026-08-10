import { useCallback, useEffect, useMemo, useState } from "react";
import Board from "./components/Board.jsx";
import WorkPackageModal from "./components/WorkPackageModal.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import Toaster from "./components/Toaster.jsx";
import ProjectFilter from "./components/ProjectFilter.jsx";
import StatusFilter from "./components/StatusFilter.jsx";
import { api } from "./api.js";
import { initials, requestNotificationPermission, showBrowserNotification, playNotificationSound } from "./utils.js";
import { useTaskWatcher } from "./useTaskWatcher.js";

let toastSeq = 0;

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

function loadLayout() {
  const v = localStorage.getItem("op-layout");
  return v === "vertical" ? "vertical" : "horizontal";
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
  const [layout, setLayout] = useState(loadLayout);

  const notify = useCallback((message, kind = "success") => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

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
    localStorage.setItem("op-layout", layout);
  }, [layout]);

  const toggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
    showBrowserNotification("Meu Board", "Notificação de teste — se você viu/ouviu isso, está tudo certo.");
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

  const visibleWorkPackages = useMemo(() => {
    if (selectedProjects.size === 0) return workPackages;
    return workPackages.filter((w) => selectedProjects.has(w.project));
  }, [workPackages, selectedProjects]);


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
          notify(message, "info");
          showBrowserNotification("Meu Board", message);
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

  function handleDatesSaved(wpId, patch) {
    setWorkPackages((list) => list.map((w) => (w.id === wpId ? { ...w, ...patch } : w)));
    setOpenWp((cur) => (cur && cur.id === wpId ? { ...cur, ...patch } : cur));
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">📋</span>
          <h1>Minhas Tasks — OpenProject</h1>
        </div>

        <div className="topbar-right">
          <ProjectFilter
            projects={projectNames}
            selected={selectedProjects}
            onChange={setSelectedProjects}
          />

          <StatusFilter
            statuses={statusNames}
            selected={selectedStatuses}
            onChange={setSelectedStatuses}
          />

          <button
            className="icon-btn"
            onClick={() => setLayout((v) => (v === "horizontal" ? "vertical" : "horizontal"))}
            title="Alternar layout do board"
          >
            {layout === "horizontal" ? "↕ Vertical" : "↔ Horizontal"}
          </button>

          <label className="switch-label">
            só as minhas
            <span className="switch" data-on={onlyMe} onClick={() => setOnlyMe((v) => !v)}>
              <span className="knob" />
            </span>
          </label>

          <button
            className="icon-btn"
            onClick={() => setSoundOn((v) => !v)}
            title="Ativar/desativar notificação sonora"
          >
            {soundOn ? "🔔" : "🔕"}
          </button>

          <button className="icon-btn" onClick={handleEnableNotifications} title="Pede permissão do navegador e ativa notificações">
            Ativar notificações
          </button>

          <button className="icon-btn" onClick={handleTestNotification} title="Dispara uma notificação de teste (som + browser)">
            Testar
          </button>

          <button className="icon-btn" onClick={loadAll}>
            ⟳ Recarregar
          </button>

          <ThemeToggle />

          {me && (
            <div className="user-chip">
              <span className="avatar">{initials(me.name)}</span>
              <span>{me.name}</span>
            </div>
          )}
        </div>
      </header>

      {loading && workPackages.length === 0 ? (
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
          selectedStatuses={selectedStatuses}
          layout={layout}
        />
      )}

      {openWp && (
        <WorkPackageModal
          wp={openWp}
          onClose={() => setOpenWp(null)}
          onDatesSaved={handleDatesSaved}
          notify={notify}
        />
      )}

      <Toaster toasts={toasts} />
    </div>
  );
}
