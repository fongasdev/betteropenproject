import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { priorityStyle, formatDate, isOverdue } from "../utils.js";

export default function Card({ wp, onOpen, pinged, collapsed, onToggleCollapse }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: wp.id,
    data: { wp },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const pr = priorityStyle(wp.priority);
  const overdue = isOverdue(wp.dueDate);

  function handleToggleCollapse(e) {
    e.stopPropagation();
    onToggleCollapse?.(wp.id);
  }

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`card${isDragging ? " dragging" : ""}${collapsed ? " collapsed" : ""}`}
      layout
      layoutId={`card-${wp.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2 }}
      transition={{
        layout: { duration: 0.12, ease: "easeOut" },
        default: { type: "spring", stiffness: 500, damping: 32 },
      }}
      onClick={() => onOpen(wp)}
    >
      {pinged && <span className="ping-dot" title="Atualização recente de outra pessoa" />}

      {onToggleCollapse && (
        <button
          className="card-collapse-btn"
          onClick={handleToggleCollapse}
          onPointerDown={(e) => e.stopPropagation()}
          title={collapsed ? "Expandir card" : "Minimizar card"}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      )}

      <div className="card-top">
        <span className="card-id">#{wp.id}</span>
        {wp.priority && (
          <span className="priority-badge" style={{ background: pr.bg, color: pr.fg }}>
            {wp.priority}
          </span>
        )}
      </div>

      <div className="card-subject">{wp.subject}</div>

      {!collapsed && (
        <>
          <div className="card-meta">
            <span className="card-project" title={wp.project}>
              {wp.project}
            </span>
            <span>{wp.type}</span>
          </div>

          {(wp.startDate || wp.dueDate) && (
            <div className="card-dates">
              {wp.startDate && <span className="date-chip">▶ {formatDate(wp.startDate)}</span>}
              {wp.dueDate && (
                <span className={`date-chip${overdue ? " overdue" : ""}`}>
                  ⏱ {formatDate(wp.dueDate)}
                </span>
              )}
            </div>
          )}

          {typeof wp.percentageDone === "number" && (
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${wp.percentageDone}%` }} />
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
