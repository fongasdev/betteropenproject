import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { priorityStyle, isFinishedStatus } from "../utils.js";

const DAY_CAPACITY_HOURS = 7;
const MAX_ESTIMATE_DAYS = 30;
const WEEKDAY_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function nextWorkday(iso) {
  const d = new Date(`${iso}T00:00:00`);
  do {
    d.setDate(d.getDate() + 1);
  } while (d.getDay() === 0 || d.getDay() === 6);
  return toISODate(d);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // semana começa na segunda
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildWeekDays(anchor) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// Grade do mês inteiro (todas as semanas que tocam o mês, seg–dom, incluindo
// dias de meses vizinhos pra completar a semana).
function buildMonthDays(anchor) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = startOfWeek(first);
  const end = new Date(startOfWeek(last));
  end.setDate(end.getDate() + 6);
  const days = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export default function AgendaView({ workPackages }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const [viewMode, setViewMode] = useState("week"); // "week" | "month"
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pickerDate, setPickerDate] = useState(null);

  const weekDays = useMemo(() => buildWeekDays(anchor), [anchor]);
  const monthDays = useMemo(() => buildMonthDays(anchor), [anchor]);
  const gridDays = viewMode === "month" ? monthDays : weekDays;
  const rangeStart = toISODate(gridDays[0]);
  const rangeEnd = toISODate(gridDays[gridDays.length - 1]);
  const todayISO = toISODate(new Date());

  async function reload() {
    setLoading(true);
    try {
      const data = await api.getSchedule(rangeStart, rangeEnd);
      setEntries(data);
    } catch (e) {
      setError(e.message || "Falha ao carregar agenda");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeStart, rangeEnd]);

  const scheduledWpIds = useMemo(() => new Set(entries.map((e) => e.wp_id)), [entries]);
  const unscheduled = useMemo(
    () => (workPackages || []).filter((wp) => !scheduledWpIds.has(wp.id)),
    [workPackages, scheduledWpIds]
  );

  const entriesByDate = useMemo(() => {
    const map = {};
    for (const e of entries) {
      (map[e.date] = map[e.date] || []).push(e);
    }
    return map;
  }, [entries]);

  async function usedHoursOn(dateISO) {
    if (entriesByDate[dateISO]) {
      return entriesByDate[dateISO].reduce((sum, e) => sum + e.estimated_hours, 0);
    }
    const data = await api.getSchedule(dateISO, dateISO);
    return data.reduce((sum, e) => sum + e.estimated_hours, 0);
  }

  async function handlePickTask(wp, hours) {
    setError("");
    let remaining = parseFloat(hours);
    if (!wp || !remaining || remaining <= 0) {
      setError("Estimativa de horas inválida.");
      return;
    }
    if (pickerDate < todayISO) {
      setError("Não é possível agendar para uma data passada.");
      return;
    }
    try {
      let date = pickerDate;
      const spilledDays = [];
      // Estoura o limite diário (7h)? Sobra vai pro próximo dia útil, usando
      // o que restar de capacidade em cada dia, até acabar a estimativa.
      while (remaining > 0) {
        const used = await usedHoursOn(date);
        const capacity = Math.max(0, DAY_CAPACITY_HOURS - used);
        if (capacity <= 0) {
          date = nextWorkday(date);
          continue;
        }
        const take = Math.min(remaining, capacity);
        await api.addScheduleEntry(wp.id, wp.subject, date, take);
        if (date !== pickerDate) spilledDays.push(date);
        remaining -= take;
        if (remaining > 0) date = nextWorkday(date);
      }
      if (spilledDays.length > 0) {
        setError(
          `"${wp.subject}" passou do limite diário — parte foi pro dia ${spilledDays[spilledDays.length - 1]}.`
        );
      }
      setPickerDate(null);
      reload();
    } catch (err) {
      setError(err.message || "Falha ao agendar tarefa");
    }
  }

  async function handleDelete(entryId) {
    await api.deleteScheduleEntry(entryId);
    reload();
  }

  // Desagendar: tira a tarefa de todos os dias/agendas em que foi planejada,
  // não só do dia atual.
  async function handleUnschedule(wpId, wpSubject) {
    if (!window.confirm(`Desagendar "${wpSubject}"? Remove de todos os dias da agenda.`)) return;
    await api.unscheduleWorkPackage(wpId);
    reload();
  }

  async function handleMoveDay(entryId, newDate) {
    if (newDate < todayISO) {
      setError("Não é possível agendar para uma data passada.");
      return;
    }
    await api.updateScheduleEntry(entryId, { date: newDate });
    reload();
  }

  async function handleHoursChange(entryId, hours) {
    const h = parseFloat(hours);
    if (!h || h <= 0) return;
    await api.updateScheduleEntry(entryId, { estimated_hours: h });
    reload();
  }

  function shiftPeriod(delta) {
    setAnchor((cur) => {
      const d = new Date(cur);
      if (viewMode === "month") {
        d.setMonth(d.getMonth() + delta);
      } else {
        d.setDate(d.getDate() + delta * 7);
      }
      return d;
    });
  }

  const MONTH_LABEL = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  return (
    <div className="agenda-view">
      <div className="agenda-toolbar">
        <div className="agenda-view-toggle">
          <button
            className={`icon-btn${viewMode === "week" ? " active" : ""}`}
            onClick={() => setViewMode("week")}
          >
            Semana
          </button>
          <button
            className={`icon-btn${viewMode === "month" ? " active" : ""}`}
            onClick={() => setViewMode("month")}
          >
            Mês
          </button>
        </div>
        <button className="icon-btn" onClick={() => shiftPeriod(-1)} title="Período anterior">
          ← {viewMode === "month" ? "Mês" : "Semana"}
        </button>
        <button className="icon-btn" onClick={() => setAnchor(new Date())} title="Ir pra hoje">
          Hoje
        </button>
        <button className="icon-btn" onClick={() => shiftPeriod(1)} title="Próximo período">
          {viewMode === "month" ? "Mês" : "Semana"} →
        </button>
        <span className="agenda-range">
          {viewMode === "month"
            ? `${MONTH_LABEL[anchor.getMonth()]} de ${anchor.getFullYear()}`
            : `${rangeStart} — ${rangeEnd}`}
        </span>
      </div>

      {error && (
        <div className="agenda-error">
          <span>{error}</span>
          <button className="icon-btn agenda-error-dismiss" onClick={() => setError("")} title="Ocultar mensagem">
            ✕
          </button>
        </div>
      )}

      <div className={viewMode === "month" ? "agenda-month" : "agenda-week"}>
        {gridDays.map((d) => {
          const iso = toISODate(d);
          const dayEntries = entriesByDate[iso] || [];
          const usedHours = dayEntries.reduce((sum, e) => sum + e.estimated_hours, 0);
          const over = usedHours > DAY_CAPACITY_HOURS;
          const outsideMonth = viewMode === "month" && d.getMonth() !== anchor.getMonth();
          const isPast = iso < todayISO;
          return (
            <div className={`agenda-day${outsideMonth ? " outside-month" : ""}${isPast ? " past" : ""}`} key={iso}>
              <div className="agenda-day-header">
                <strong>
                  {WEEKDAY_LABEL[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                </strong>
                <span className={`agenda-day-capacity${over ? " over" : ""}`}>
                  {usedHours}h / {DAY_CAPACITY_HOURS}h
                </span>
              </div>
              <div className="agenda-day-body">
                {dayEntries.length === 0 && !loading && (
                  <div className="agenda-day-empty">sem tarefas</div>
                )}
                {dayEntries.map((e) => {
                  const wp = (workPackages || []).find((w) => w.id === e.wp_id);
                  const pr = wp ? priorityStyle(wp.priority) : null;
                  const overdue = isPast && !isFinishedStatus(wp?.status);
                  return (
                  <div className={`agenda-entry${overdue ? " overdue" : ""}`} key={e.id}>
                    <div className="agenda-entry-title">
                      #{e.wp_id} — {e.wp_subject}
                      {overdue && <span className="agenda-entry-overdue-badge">atrasada</span>}
                    </div>
                    {wp && (
                      <div className="agenda-entry-meta">
                        {wp.project && <span className="agenda-entry-project">{wp.project}</span>}
                        {wp.priority && (
                          <span
                            className="priority-badge"
                            style={{ background: pr.bg, color: pr.fg }}
                          >
                            {wp.priority}
                          </span>
                        )}
                      </div>
                    )}
                    <DurationSlider
                      value={e.estimated_hours}
                      onCommit={(v) => handleHoursChange(e.id, v)}
                    />
                    <div className="agenda-entry-controls">
                      <select value={iso} onChange={(ev) => handleMoveDay(e.id, ev.target.value)}>
                        {gridDays.map((wd) => {
                          const wdIso = toISODate(wd);
                          return (
                            <option key={wdIso} value={wdIso} disabled={wdIso < todayISO}>
                              {WEEKDAY_LABEL[wd.getDay()]} {wd.getDate()}/{wd.getMonth() + 1}
                            </option>
                          );
                        })}
                      </select>
                      <button
                        className="icon-btn agenda-entry-remove"
                        onClick={() => handleDelete(e.id)}
                        title="Remover desse dia"
                      >
                        ✕
                      </button>
                      <button
                        className="icon-btn agenda-entry-unschedule"
                        onClick={() => handleUnschedule(e.wp_id, e.wp_subject)}
                        title="Desagendar (remove de todos os dias)"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  );
                })}
                {!isPast && (
                  <button
                    className="icon-btn agenda-add-btn"
                    onClick={() => setPickerDate(iso)}
                    title="Adicionar tarefa nesse dia"
                  >
                    + tarefa
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {pickerDate && (
        <TaskPickerModal
          date={pickerDate}
          tasks={unscheduled}
          onPick={handlePickTask}
          onClose={() => setPickerDate(null)}
        />
      )}
    </div>
  );
}

function splitDuration(totalHours) {
  const days = Math.floor(totalHours / DAY_CAPACITY_HOURS);
  const hours = Math.round((totalHours - days * DAY_CAPACITY_HOURS) * 2) / 2;
  return { days, hours };
}

function formatDuration({ days, hours }) {
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days === 0) parts.push(`${hours}h`);
  return parts.join(" ");
}

// Slider duplo (dias + horas) pra estimar prazos maiores sem exigir um
// campo numérico — dias vão até 30, horas até a capacidade de um dia (7h).
function DurationSlider({ value, onCommit }) {
  const [local, setLocal] = useState(() => splitDuration(value));

  useEffect(() => setLocal(splitDuration(value)), [value]);

  function commit(next) {
    onCommit(next.days * DAY_CAPACITY_HOURS + next.hours);
  }

  return (
    <div className="duration-slider">
      <div className="duration-slider-row">
        <span className="duration-slider-icon" title="Dias">
          📅
        </span>
        <input
          className="duration-slider-track duration-slider-track-days"
          type="range"
          min="0"
          max={MAX_ESTIMATE_DAYS}
          step="1"
          value={local.days}
          onChange={(ev) => setLocal((l) => ({ ...l, days: parseInt(ev.target.value, 10) }))}
          onMouseUp={() => commit(local)}
          onTouchEnd={() => commit(local)}
          onKeyUp={() => commit(local)}
        />
        <span className="duration-slider-value">{local.days}d</span>
      </div>
      <div className="duration-slider-row">
        <span className="duration-slider-icon" title="Horas">
          ⏱️
        </span>
        <input
          className="duration-slider-track duration-slider-track-hours"
          type="range"
          min="0"
          max={DAY_CAPACITY_HOURS}
          step="0.5"
          value={local.hours}
          onChange={(ev) => setLocal((l) => ({ ...l, hours: parseFloat(ev.target.value) }))}
          onMouseUp={() => commit(local)}
          onTouchEnd={() => commit(local)}
          onKeyUp={() => commit(local)}
        />
        <span className="duration-slider-value">{local.hours}h</span>
      </div>
      <div className="duration-slider-total">{formatDuration(local)} no total</div>
    </div>
  );
}

function TaskPickerModal({ date, tasks, onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [hours, setHours] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.subject?.toLowerCase().includes(q) ||
        t.project?.toLowerCase().includes(q) ||
        String(t.id).includes(q)
    );
  }, [tasks, query]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal agenda-picker-modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>
        <h2>Adicionar tarefa — {date}</h2>

        <input
          className="agenda-picker-search"
          type="text"
          placeholder="Buscar por título, projeto ou #id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />

        <div className="agenda-picker-list">
          {filtered.length === 0 && (
            <div className="agenda-day-empty">nenhuma tarefa não agendada encontrada</div>
          )}
          {filtered.map((wp) => {
            const pr = priorityStyle(wp.priority);
            return (
              <button
                key={wp.id}
                className={`agenda-picker-item${selected?.id === wp.id ? " selected" : ""}`}
                onClick={() => setSelected(wp)}
              >
                <div className="agenda-picker-item-title">
                  #{wp.id} — {wp.subject}
                </div>
                <div className="agenda-picker-item-meta">
                  {wp.project && <span className="agenda-entry-project">{wp.project}</span>}
                  {wp.priority && (
                    <span className="priority-badge" style={{ background: pr.bg, color: pr.fg }}>
                      {wp.priority}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="agenda-picker-footer">
          <div className="agenda-picker-estimate">
            <span className="agenda-picker-estimate-label">Estimativa</span>
            <DurationSlider value={hours} onCommit={setHours} />
          </div>
          <button
            className="icon-btn"
            disabled={!selected}
            onClick={() => selected && onPick(selected, hours)}
          >
            + Agendar
          </button>
        </div>
      </div>
    </div>
  );
}
