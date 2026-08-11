import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence } from "framer-motion";
import Card from "./Card.jsx";
import { statusColor } from "../utils.js";

export default function Column({
  status,
  items,
  onOpenCard,
  pingedIds,
  collapsedIds,
  onToggleCollapse,
  collapsed,
  onToggleColumnCollapse,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status.name}`, data: { status } });
  const ids = items.map((w) => w.id);

  const {
    attributes,
    listeners,
    setNodeRef: setColRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `col-${status.name}`, data: { type: "column", status } });

  const colStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  function handleToggleColumnCollapse(e) {
    e.stopPropagation();
    onToggleColumnCollapse?.(status.name);
  }

  return (
    <div
      ref={setColRef}
      style={colStyle}
      className={`column${isDragging ? " column-dragging" : ""}${collapsed ? " column-collapsed" : ""}`}
    >
      <div className="column-header" {...attributes} {...listeners}>
        <span className="status-dot" style={{ background: statusColor(status.name) }} />
        <span className="col-title">{status.name}</span>
        <span className="count">{items.length}</span>

        {onToggleColumnCollapse && (
          <button
            className="column-collapse-btn"
            onClick={handleToggleColumnCollapse}
            onPointerDown={(e) => e.stopPropagation()}
            title={collapsed ? "Expandir coluna" : "Minimizar coluna"}
          >
            {collapsed ? "▸" : "▾"}
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        className={`column-body${isOver ? " drag-over" : ""}${collapsed ? " column-body-collapsed" : ""}`}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {!collapsed &&
              items.map((wp) => (
                <Card
                  key={wp.id}
                  wp={wp}
                  onOpen={onOpenCard}
                  pinged={pingedIds?.has(wp.id)}
                  collapsed={collapsedIds?.has(wp.id)}
                  onToggleCollapse={onToggleCollapse}
                />
              ))}
          </AnimatePresence>
        </SortableContext>

        {!collapsed && items.length === 0 && <div className="column-empty">Solte um card aqui</div>}
      </div>
    </div>
  );
}
