import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

export const CONFIG_ITEMS = [
  { id: "projectFilter", label: "Filtro de projetos" },
  { id: "statusFilter", label: "Filtro de status" },
  { id: "typeFilter", label: "Filtro de tipo" },
  { id: "layoutToggle", label: "Alternar layout do board" },
  { id: "resetView", label: "Redefinir visualização" },
  { id: "onlyMe", label: "Só as minhas" },
  { id: "hideEmptyColumns", label: "Ocultar colunas vazias" },
  { id: "soundToggle", label: "Notificação sonora" },
  { id: "notificationCenter", label: "Central de notificações" },
  { id: "enableNotifications", label: "Ativar notificações" },
  { id: "testNotification", label: "Testar notificação" },
  { id: "reload", label: "Recarregar" },
  { id: "palette", label: "Paleta de cores" },
  { id: "theme", label: "Tema claro/escuro" },
  { id: "userChip", label: "Usuário logado" },
];

export function loadVisibleConfigs() {
  try {
    const raw = localStorage.getItem("op-visible-configs");
    if (!raw) return new Set(CONFIG_ITEMS.map((c) => c.id));
    const arr = JSON.parse(raw);
    return new Set(arr);
  } catch (e) {
    return new Set(CONFIG_ITEMS.map((c) => c.id));
  }
}

export default function ConfigVisibilityMenu({ visible, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function toggle(id) {
    const next = new Set(visible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="config-visibility-menu" ref={rootRef}>
      <button
        className="icon-btn topbar-left topbar-collapse-btn"
        onClick={() => setOpen((v) => !v)}
        title="Escolher quais configurações aparecem"
      >
        <span className="logo">⚙</span>
        <h1>Configurações</h1>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="config-visibility-panel"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
          >
            <div className="project-filter-actions">
              <button onClick={() => onChange(new Set())}>Limpar</button>
              <button onClick={() => onChange(new Set(CONFIG_ITEMS.map((c) => c.id)))}>
                Selecionar todos
              </button>
            </div>
            {CONFIG_ITEMS.map((item) => (
              <label key={item.id} className="project-filter-item">
                <input
                  type="checkbox"
                  checked={visible.has(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
