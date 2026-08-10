import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence } from "framer-motion";
import Card from "./Card.jsx";
import { statusColor } from "../utils.js";

export default function Column({ status, items, onOpenCard, pingedIds, collapsedIds, onToggleCollapse }) {
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

  return (
    <div ref={setColRef} style={colStyle} className={`column${isDragging ? " column-dragging" : ""}`}>
      <div className="column-header" {...attributes} {...listeners}>
        <span className="status-dot" style={{ background: statusColor(status.name) }} />
        <span className="col-title">{status.name}</span>
        <span className="count">{items.length}</span>
      </div>

      <div ref={setNodeRef} className={`column-body${isOver ? " drag-over" : ""}`}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {items.map((wp) => (
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

        {items.length === 0 && <div className="column-empty">Solte um card aqui</div>}
      </div>
    </div>
  );
}
