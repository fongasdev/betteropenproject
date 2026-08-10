import { useTheme } from "../ThemeContext.jsx";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button className="theme-toggle" onClick={toggleTheme} title="Alternar tema" aria-label="Alternar tema claro/escuro">
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
