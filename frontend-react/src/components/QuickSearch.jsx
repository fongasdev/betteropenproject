import { useEffect, useMemo, useRef, useState } from "react";
import { wpCache } from "../wpCache.js";

const IGNORE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Busca "invisível": não tem lupa nem campo na tela até o usuário começar a
// digitar em qualquer lugar do app (fora de um campo já existente). A
// primeira tecla abre a caixa sozinha; dali em diante o input assume a
// digitação normalmente. Fecha e some de novo ao limpar o texto, apertar
// Esc ou clicar fora.
export default function QuickSearch({ workPackages, onOpenWp, disabled }) {
  const [query, setQuery] = useState("");
  const [remoteResult, setRemoteResult] = useState(null);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (disabled) return;
    function onKeyDown(e) {
      if (hasQuery) return; // já aberta — quem cuida da digitação é o input
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return; // só caractere imprimível (letra/número/espaço)
      const active = document.activeElement;
      if (active && (IGNORE_TAGS.has(active.tagName) || active.isContentEditable)) return;
      setQuery(e.key);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, hasQuery]);

  useEffect(() => {
    if (hasQuery) inputRef.current?.focus();
  }, [hasQuery]);

  useEffect(() => {
    function onClickOutside(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) close();
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function close() {
    setQuery("");
    setRemoteResult(null);
  }

  const localMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return (workPackages || [])
      .filter((wp) => String(wp.id).includes(q) || wp.subject?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [workPackages, query]);

  // Texto puramente numérico sem match local? Pode ser uma task que existe
  // mas não está na lista já carregada (ex.: não atribuída a mim) — tenta
  // achar direto pelo id no backend, usando o mesmo cache das relacionadas.
  useEffect(() => {
    const q = query.trim();
    setRemoteResult(null);
    if (!/^\d+$/.test(q) || localMatches.some((wp) => String(wp.id) === q)) return;
    let cancelled = false;
    setSearchingRemote(true);
    wpCache
      .loadWorkPackage(Number(q))
      .then((data) => !cancelled && setRemoteResult(data))
      .catch(() => {})
      .finally(() => !cancelled && setSearchingRemote(false));
    return () => {
      cancelled = true;
    };
  }, [query, localMatches]);

  if (!hasQuery) return null;

  const results = remoteResult ? [remoteResult, ...localMatches] : localMatches;

  function handlePick(wp) {
    onOpenWp(wp);
    close();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") close();
    else if (e.key === "Enter" && results[0]) handlePick(results[0]);
  }

  return (
    <div className="quick-search" ref={rootRef}>
      <div className="quick-search-box">
        <span className="quick-search-icon">🔍</span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar por #id ou título..."
        />
        <button className="quick-search-close" onClick={close} title="Fechar busca (Esc)">
          ✕
        </button>
      </div>
      <div className="quick-search-results">
        {searchingRemote && results.length === 0 && (
          <div className="empty-state">Buscando #{query}...</div>
        )}
        {!searchingRemote && results.length === 0 && (
          <div className="empty-state">Nenhuma task encontrada.</div>
        )}
        {results.map((wp) => (
          <button key={wp.id} className="quick-search-item" onClick={() => handlePick(wp)}>
            <span className="quick-search-item-id">#{wp.id}</span>
            <span className="quick-search-item-subject">{wp.subject}</span>
            <span className="quick-search-item-meta">
              {wp.project} · {wp.status}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
