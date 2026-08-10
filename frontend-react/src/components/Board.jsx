import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import Column from "./Column.jsx";
import Card from "./Card.jsx";

function loadColumnOrder() {
  try {
    const raw = localStorage.getItem("op-column-order");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export default function Board({
  statuses,
  workPackages,
  onOpenCard,
  onMove,
  pingedIds,
  collapsedIds,
  onToggleCollapse,
  selectedStatuses,
  layout = "horizontal",
}) {
  const [activeWp, setActiveWp] = useState(null);
  const [activeColumn, setActiveColumn] = useState(null);
  const [columnOrder, setColumnOrder] = useState(loadColumnOrder);

  useEffect(() => {
    localStorage.setItem("op-column-order", JSON.stringify(columnOrder));
  }, [columnOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const columns = useMemo(() => {
    // Mostra sempre todos os status conhecidos (mesmo sem tasks) para servir
    // de alvo de drag-and-drop. Status de tasks que não estão na lista
    // oficial (ex.: workflow customizado) também entram, no fim.
    const used = new Set(workPackages.map((w) => w.status));
    const ordered = [...statuses];
    used.forEach((name) => {
      if (!ordered.find((s) => s.name === name)) ordered.push({ id: null, name });
    });
    const filtered =
      selectedStatuses && selectedStatuses.size > 0
        ? ordered.filter((s) => selectedStatuses.has(s.name))
        : ordered;

    // Aplica a ordem manual salva (arrastar coluna); nomes sem posição salva
    // ficam no final, na ordem original.
    return [...filtered].sort((a, b) => {
      const ia = columnOrder.indexOf(a.name);
      const ib = columnOrder.indexOf(b.name);
      if (ia === -1 && ib === -1) return 0;
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [statuses, workPackages, selectedStatuses, columnOrder]);

  const columnIds = useMemo(() => columns.map((s) => `col-${s.name}`), [columns]);

  function itemsFor(statusName) {
    return workPackages.filter((w) => w.status === statusName);
  }

  function findWp(id) {
    return workPackages.find((w) => w.id === id);
  }

  function handleDragStart(event) {
    const { active } = event;
    if (active.data.current?.type === "column") {
      setActiveColumn(active.data.current.status);
      return;
    }
    const wp = findWp(active.id);
    setActiveWp(wp || null);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveWp(null);
    setActiveColumn(null);
    if (!over) return;

    // Arrastando uma coluna inteira (reordenar/estacionar em outra linha).
    if (active.data.current?.type === "column") {
      if (over.data.current?.type !== "column" || active.id === over.id) return;
      const currentOrder = columnIds; // já reflete a ordem visível atual
      const oldIndex = currentOrder.indexOf(active.id);
      const newIndex = currentOrder.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(currentOrder, oldIndex, newIndex).map((id) =>
        id.replace(/^col-/, "")
      );
      setColumnOrder(reordered);
      return;
    }

    const wp = findWp(active.id);
    if (!wp) return;

    // over.id pode ser o id de outro card (solto em cima dele) ou "column-<nome>"
    let targetStatusName;
    if (typeof over.id === "string" && over.id.startsWith("column-")) {
      targetStatusName = over.data.current?.status?.name;
    } else {
      const overWp = findWp(over.id);
      targetStatusName = overWp?.status;
    }
    if (!targetStatusName || targetStatusName === wp.status) return;

    const targetStatus = statuses.find((s) => s.name === targetStatusName);
    if (!targetStatus) return;

    onMove(wp, targetStatus);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="board-wrap">
        <div className={`board board-${layout}`}>
          <SortableContext items={columnIds} strategy={rectSortingStrategy}>
            {columns.map((status) => (
              <Column
                key={status.name}
                status={status}
                items={itemsFor(status.name)}
                onOpenCard={onOpenCard}
                pingedIds={pingedIds}
                collapsedIds={collapsedIds}
                onToggleCollapse={onToggleCollapse}
              />
            ))}
          </SortableContext>
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeWp ? <Card wp={activeWp} onOpen={() => {}} /> : null}
        {activeColumn ? (
          <div className="column column-overlay">
            <div className="column-header">
              <span className="col-title">{activeColumn.name}</span>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
