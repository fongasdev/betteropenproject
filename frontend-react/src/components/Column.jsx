import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence } from "framer-motion";
import Card from "./Card.jsx";
import { statusColor } from "../utils.js";

export default function Column({ status, items, onOpenCard, pingedIds }) {
  const { setNodeRef, isOver } = useDroppable({ id: `column-${status.name}`, data: { status } });
  const ids = items.map((w) => w.id);

  return (
    <div className="column">
      <div className="column-header">
        <span className="status-dot" style={{ background: statusColor(status.name) }} />
        <span className="col-title">{status.name}</span>
        <span className="count">{items.length}</span>
      </div>

      <div ref={setNodeRef} className={`column-body${isOver ? " drag-over" : ""}`}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <AnimatePresence initial={false}>
            {items.map((wp) => (
              <Card key={wp.id} wp={wp} onOpen={onOpenCard} pinged={pingedIds?.has(wp.id)} />
            ))}
          </AnimatePresence>
        </SortableContext>

        {items.length === 0 && <div className="column-empty">Solte um card aqui</div>}
      </div>
    </div>
  );
}
