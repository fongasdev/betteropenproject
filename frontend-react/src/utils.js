export function priorityStyle(priority) {
  const p = (priority || "").toLowerCase();
  if (p.includes("p0") || p.includes("imediata") || p.includes("alta") || p.includes("urgent")) {
    return { bg: "rgba(229,72,77,0.15)", fg: "#e5484d" };
  }
  if (p.includes("p1") || p.includes("média") || p.includes("media") || p.includes("normal")) {
    return { bg: "rgba(245,165,36,0.15)", fg: "#f5a524" };
  }
  if (p.includes("baixa") || p.includes("low")) {
    return { bg: "rgba(48,164,108,0.15)", fg: "#30a46c" };
  }
  return { bg: "rgba(107,114,128,0.15)", fg: "#6b7280" };
}

export function statusColor(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("final") || n.includes("conclu") || n.includes("done")) return "#30a46c";
  if (n.includes("rejeit") || n.includes("cancel")) return "#e5484d";
  if (n.includes("pausa") || n.includes("hold")) return "#f5a524";
  if (n.includes("test") || n.includes("review")) return "#7048e8";
  if (n.includes("desenvolv") || n.includes("progress") || n.includes("andamento")) return "#4f6df5";
  return "#8a8f98";
}

export function formatDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function isOverdue(dueDate) {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate + "T00:00:00") < today;
}

let sharedAudioCtx = null;

/** Toca um "ding" curto de duas notas via Web Audio API (sem depender de arquivo de áudio). */
export function playNotificationSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    const ctx = sharedAudioCtx;
    if (ctx.state === "suspended") ctx.resume();

    const notes = [880, 1320];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.11;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.34);
    });
  } catch (e) {
    /* ambiente sem suporte a áudio — ignora silenciosamente */
  }
}

export function initials(name) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}
