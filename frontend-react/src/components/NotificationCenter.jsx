import { useEffect, useRef, useState } from "react";

// Formata horário relativo simples (agora, 5min, 2h, 3d...) igual estilo OpenProject.
function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const KIND_ICON = { success: "✅", error: "⚠️", info: "🔔" };

export default function NotificationCenter({ notifications, onMarkAllRead, onClear, onOpenWp }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggleOpen() {
    setOpen((v) => {
      const next = !v;
      if (next && unreadCount > 0) onMarkAllRead();
      return next;
    });
  }

  return (
    <div className="notif-center" ref={boxRef}>
      <button
        className="icon-btn notif-bell"
        onClick={toggleOpen}
        title="Notificações"
      >
        🔔
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <span>Notificações</span>
            {notifications.length > 0 && (
              <button className="notif-clear" onClick={onClear}>
                Limpar tudo
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="notif-empty">Nenhuma notificação por aqui ainda.</div>
          ) : (
            <ul className="notif-list">
              {notifications.map((n) => (
                <li
                  key={n.id}
                  className={`notif-item notif-${n.kind}${n.wpId && onOpenWp ? " notif-clickable" : ""}`}
                  onClick={() => n.wpId && onOpenWp && onOpenWp(n.wpId)}
                >
                  <span className="notif-icon">{KIND_ICON[n.kind] || "🔔"}</span>
                  <span className="notif-message">{n.message}</span>
                  <span className="notif-time">{timeAgo(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
