import { useState } from "react";
import { api, ApiError } from "../api.js";

// Tela de login: cada pessoa cola a própria API key do OpenProject (My
// Account -> Access token -> API), gerada uma vez por lá. O backend valida
// contra o OpenProject e guarda a sessão num cookie httpOnly — a key nunca
// fica salva no navegador (sem localStorage), só trafega nessa chamada.
export default function Login({ openProjectUrl, onLoggedIn }) {
  const [apiKey, setApiKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!apiKey.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const user = await api.login(apiKey.trim());
      onLoggedIn(user);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao entrar. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="topbar-brand login-brand">
          <img src="/favicon.svg" alt="" className="topbar-brand-logo" />
          <span>SmartFlow</span>
        </div>

        <p className="login-subtitle">
          Entre com sua API key pessoal do OpenProject. Cada pessoa usa a própria — o
          SmartFlow passa a enxergar só o que sua conta enxerga lá.
        </p>

        <div className="field">
          <label>API key do OpenProject</label>
          <input
            type="password"
            autoFocus
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Cole aqui sua API key"
            autoComplete="off"
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button className="btn" type="submit" disabled={submitting || !apiKey.trim()}>
          {submitting ? "Entrando..." : "Entrar"}
        </button>

        {openProjectUrl && (
          <a
            className="login-help-link"
            href={`${openProjectUrl}/my/access_token`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Não tem uma key ainda? Gere em {openProjectUrl.replace(/^https?:\/\//, "")}/my/access_token ↗
          </a>
        )}
      </form>
    </div>
  );
}
