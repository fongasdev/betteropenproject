import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export default function ProjectFilter({ projects, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const label = useMemo(() => {
    if (selected.size === 0) return "Todos os projetos";
    if (selected.size === 1) return [...selected][0];
    return `${selected.size} projetos`;
  }, [selected]);

  function toggle(name) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  }

  return (
    <div className="project-filter" ref={rootRef}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)}>
        🗂 {label} ▾
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="project-filter-panel"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
          >
            <div className="project-filter-actions">
              <button onClick={() => onChange(new Set())}>Limpar</button>
              <button onClick={() => onChange(new Set(projects))}>Selecionar todos</button>
            </div>
            {projects.length === 0 && <div className="empty-state">Nenhum projeto carregado.</div>}
            {projects.map((name) => (
              <label key={name} className="project-filter-item">
                <input type="checkbox" checked={selected.has(name)} onChange={() => toggle(name)} />
                <span>{name}</span>
              </label>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
