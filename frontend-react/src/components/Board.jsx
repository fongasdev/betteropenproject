import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import Column from "./Column.jsx";
import Card from "./Card.jsx";

export default function Board({ statuses, workPackages, onOpenCard, onMove, pingedIds }) {
  const [activeWp, setActiveWp] = useState(null);

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
    return ordered;
  }, [statuses, workPackages]);

  function itemsFor(statusName) {
    return workPackages.filter((w) => w.status === statusName);
  }

  function findWp(id) {
    return workPackages.find((w) => w.id === id);
  }

  function handleDragStart(event) {
    const wp = findWp(event.active.id);
    setActiveWp(wp || null);
  }

  function handleDragEnd(event) {
    const { active, over } = event;
    setActiveWp(null);
    if (!over) return;

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
        <div className="board">
          {columns.map((status) => (
            <Column
              key={status.name}
              status={status}
              items={itemsFor(status.name)}
              onOpenCard={onOpenCard}
              pingedIds={pingedIds}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeWp ? <Card wp={activeWp} onOpen={() => {}} /> : null}
      </DragOverlay>
    </DndContext>
  );
}
