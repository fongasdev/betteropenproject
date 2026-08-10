import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { priorityStyle, formatDate, isOverdue } from "../utils.js";

export default function Card({ wp, onOpen, pinged }) {
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

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`card${isDragging ? " dragging" : ""}`}
      layout
      layoutId={`card-${wp.id}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 500, damping: 32 }}
      onClick={() => onOpen(wp)}
    >
      {pinged && <span className="ping-dot" title="Atualização recente de outra pessoa" />}
      <div className="card-top">
        <span className="card-id">#{wp.id}</span>
        {wp.priority && (
          <span className="priority-badge" style={{ background: pr.bg, color: pr.fg }}>
            {wp.priority}
          </span>
        )}
      </div>

      <div className="card-subject">{wp.subject}</div>

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
    </motion.div>
  );
}
