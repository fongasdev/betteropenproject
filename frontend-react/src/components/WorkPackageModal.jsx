import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../api.js";

export default function WorkPackageModal({ wp, onClose, onDatesSaved, notify, openProjectUrl }) {
  const [startDate, setStartDate] = useState(wp.startDate || "");
  const [dueDate, setDueDate] = useState(wp.dueDate || "");
  const [savingDates, setSavingDates] = useState(false);

  const [comment, setComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [resolvingAi, setResolvingAi] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingActivities(true);
    api
      .activities(wp.id)
      .then((data) => {
        if (!cancelled) setActivities(data.filter((a) => a.comment));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoadingActivities(false));
    return () => {
      cancelled = true;
    };
  }, [wp.id]);

  async function saveDates() {
    setSavingDates(true);
    try {
      const updated = await api.changeDates(wp.id, wp.lockVersion, startDate || null, dueDate || null);
      onDatesSaved(wp.id, { startDate, dueDate, lockVersion: updated.lockVersion });
      notify("Datas atualizadas", "success");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setSavingDates(false);
    }
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    // Fallback pra contexto não-seguro (http fora de localhost), onde
    // navigator.clipboard nem existe.
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      if (!document.execCommand("copy")) throw new Error("Cópia não suportada neste navegador");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  async function copyAiPrompt() {
    setGeneratingPrompt(true);
    try {
      const { prompt } = await api.aiPrompt(wp.id);
      await copyToClipboard(prompt);
      notify("Prompt copiado — cole no Claude Code", "success");
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setGeneratingPrompt(false);
    }
  }

  async function resolveWithAi() {
    notify("Função não implementada", "info");
    return;
    // eslint-disable-next-line no-unreachable
    setResolvingAi(true);
    setAiAnswer("");
    try {
      const { response } = await api.aiResolve(wp.id);
      setAiAnswer(response);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setResolvingAi(false);
    }
  }

  async function submitComment() {
    const text = comment.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      await api.addComment(wp.id, text);
      setComment("");
      notify("Comentário adicionado", "success");
      const data = await api.activities(wp.id);
      setActivities(data.filter((a) => a.comment));
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setPostingComment(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          className="modal"
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: "spring", stiffness: 420, damping: 32 }}
        >
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
          <div className="modal-actions-row">
            {openProjectUrl && (
              <a
                className="modal-open-op"
                href={`${openProjectUrl}/work_packages/${wp.id}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir no OpenProject"
              >
                ↗ Abrir no OpenProject
              </a>
            )}
            <button
              className="modal-open-op"
              onClick={copyAiPrompt}
              disabled={generatingPrompt}
              title="Copiar prompt para colar no Claude Code"
            >
              {generatingPrompt ? "Gerando..." : "📋 Copiar prompt IA"}
            </button>
            <button
              className="modal-open-op"
              onClick={resolveWithAi}
              disabled={resolvingAi}
              title="Manda a task direto pra API da Claude"
            >
              {resolvingAi ? "Consultando..." : "✨ Resolver com IA"}
            </button>
          </div>
          <h2 className="modal-title-with-op">
            #{wp.id} — {wp.subject}
          </h2>
          <div className="modal-subtitle">
            {wp.project} · {wp.type} · status atual: <strong>{wp.status}</strong>
          </div>

          <div className="dates-row">
            <div className="field">
              <label>Data de início</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Prazo (due date)</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <button className="btn" onClick={saveDates} disabled={savingDates}>
            {savingDates ? "Salvando..." : "Salvar datas"}
          </button>

          <div className="field" style={{ marginTop: 22 }}>
            <label>Nova anotação / comentário</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Escreva um comentário..."
            />
          </div>
          <button className="btn" onClick={submitComment} disabled={postingComment || !comment.trim()}>
            {postingComment ? "Enviando..." : "Adicionar comentário"}
          </button>

          {(resolvingAi || aiAnswer) && (
            <>
              <div className="section-title">Resposta da IA</div>
              {resolvingAi && <div className="empty-state">Consultando Claude...</div>}
              {!resolvingAi && aiAnswer && <div className="ai-answer">{aiAnswer}</div>}
            </>
          )}

          <div className="section-title">Histórico</div>
          {loadingActivities && <div className="empty-state">Carregando...</div>}
          {!loadingActivities && activities.length === 0 && (
            <div className="empty-state">Sem comentários ainda.</div>
          )}
          {activities.map((a) => (
            <div className="activity" key={a.id}>
              <div className="activity-head">
                <span className="activity-who">{a.user || "?"}</span>
                <span className="activity-when">
                  {a.createdAt ? new Date(a.createdAt).toLocaleString("pt-BR") : ""}
                </span>
              </div>
              <div className="activity-body">{a.comment}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
