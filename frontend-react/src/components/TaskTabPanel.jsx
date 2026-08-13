import { useEffect, useState } from "react";
import WorkPackageModal from "./WorkPackageModal.jsx";
import { wpCache } from "../wpCache.js";

// Conteúdo de uma aba de tarefa: busca a task completa (cache primeiro,
// revalida em background — mesmo padrão já usado pro card pai no modal) e
// renderiza o WorkPackageModal em modo `embedded` (visão expandida, sem
// overlay), ocupando o espaço da aba ativa.
export default function TaskTabPanel({
  wpId,
  subjectHint,
  onClose,
  onDatesSaved,
  notify,
  openProjectUrl,
  onOpenRelated,
  canGoBack,
  onBack,
}) {
  const [wp, setWp] = useState(() => wpCache.peekWorkPackage(wpId));
  const [loading, setLoading] = useState(!wp);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const cached = wpCache.peekWorkPackage(wpId);
    setWp(cached);
    setLoading(!cached);
    setError("");
    wpCache
      .loadWorkPackage(wpId)
      .then((data) => !cancelled && setWp(data))
      .catch((e) => !cancelled && setError(e.message || "Falha ao carregar task"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [wpId]);

  function handleDatesSaved(id, patch) {
    setWp((cur) => (cur ? { ...cur, ...patch } : cur));
    onDatesSaved?.(id, patch);
  }

  if (!wp) {
    return (
      <div className="tab-task-panel">
        {loading && (
          <div className="loading-wrap">
            <span className="spinner" />
            Carregando #{wpId} {subjectHint ? `— ${subjectHint}` : ""}...
          </div>
        )}
        {!loading && error && <div className="empty-state">{error}</div>}
      </div>
    );
  }

  return (
    <WorkPackageModal
      wp={wp}
      embedded
      onClose={onClose}
      onDatesSaved={handleDatesSaved}
      notify={notify}
      openProjectUrl={openProjectUrl}
      onOpenRelated={onOpenRelated}
      canGoBack={canGoBack}
      onBack={onBack}
    />
  );
}
