import { useEffect, useState } from "react";
import App from "./App.jsx";
import Login from "./components/Login.jsx";
import { api } from "./api.js";

// Só monta o <App/> (e todos os efeitos/polling dele) depois de confirmar
// que existe uma sessão válida — evita disparar chamadas autenticadas antes
// da hora e garante que expirar a sessão no meio do uso derruba tudo de
// volta pro login de forma limpa (App desmonta, cleanups dos useEffect
// cortam os intervals/watchers sozinhos).
export default function AuthGate() {
  const [status, setStatus] = useState("checking"); // "checking" | "authed" | "anon"
  const [openProjectUrl, setOpenProjectUrl] = useState(null);

  useEffect(() => {
    api.config().then((c) => setOpenProjectUrl(c.openProjectUrl)).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .me()
      .then(() => setStatus("authed"))
      .catch(() => setStatus("anon"));
  }, []);

  useEffect(() => {
    api.setUnauthorizedHandler(() => setStatus("anon"));
    return () => api.setUnauthorizedHandler(null);
  }, []);

  if (status === "checking") {
    return (
      <div className="loading-wrap">
        <span className="spinner" />
        Carregando...
      </div>
    );
  }

  if (status === "anon") {
    return <Login openProjectUrl={openProjectUrl} onLoggedIn={() => setStatus("authed")} />;
  }

  return <App onLogout={() => setStatus("anon")} />;
}
