const BASE = "/api";

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Chamado quando qualquer request volta 401 (sessão inexistente/expirada) —
// a AuthGate registra isso pra derrubar a tela de volta pro login sem
// precisar que cada chamador da API trate o caso na mão.
let unauthorizedHandler = null;

async function handle(res) {
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const body = await res.json();
      message = body.detail || message;
    } catch (e) {
      /* ignore */
    }
    if (res.status === 401) unauthorizedHandler?.();
    throw new ApiError(message, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  setUnauthorizedHandler: (fn) => {
    unauthorizedHandler = fn;
  },

  config: () => fetch(`${BASE}/config`).then(handle),

  login: (apiKey) =>
    fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    }).then(handle),

  logout: () => fetch(`${BASE}/logout`, { method: "POST" }).then(handle),

  me: () => fetch(`${BASE}/me`).then(handle),

  statuses: () => fetch(`${BASE}/statuses`).then(handle),

  projects: () => fetch(`${BASE}/projects`).then(handle),

  workPackages: (onlyMe) =>
    fetch(`${BASE}/work_packages?only_me=${onlyMe}`).then(handle),

  workPackage: (wpId) => fetch(`${BASE}/work_packages/${wpId}`).then(handle),

  availableStatuses: (wpId, lockVersion) =>
    fetch(`${BASE}/work_packages/${wpId}/available_statuses?lock_version=${lockVersion}`).then(
      handle
    ),

  changeStatus: (wpId, lockVersion, statusId) =>
    fetch(`${BASE}/work_packages/${wpId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lockVersion, statusId }),
    }).then(handle),

  changeDates: (wpId, lockVersion, startDate, dueDate) =>
    fetch(`${BASE}/work_packages/${wpId}/dates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lockVersion, startDate, dueDate }),
    }).then(handle),

  activities: (wpId) => fetch(`${BASE}/work_packages/${wpId}/activities`).then(handle),

  notifications: () => fetch(`${BASE}/notifications`).then(handle),

  aiPrompt: (wpId) => fetch(`${BASE}/work_packages/${wpId}/ai_prompt`).then(handle),

  nearestStory: (wpId) => fetch(`${BASE}/work_packages/${wpId}/nearest_story`).then(handle),

  aiResolve: (wpId) =>
    fetch(`${BASE}/work_packages/${wpId}/ai_resolve`, { method: "POST" }).then(handle),

  addComment: (wpId, comment) =>
    fetch(`${BASE}/work_packages/${wpId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment }),
    }).then(handle),

  getSchedule: (start, end) =>
    fetch(`${BASE}/schedule?start=${start}&end=${end}`).then(handle),

  addScheduleEntry: (wpId, wpSubject, date, estimatedHours) =>
    fetch(`${BASE}/schedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wp_id: wpId,
        wp_subject: wpSubject,
        date,
        estimated_hours: estimatedHours,
      }),
    }).then(handle),

  updateScheduleEntry: (entryId, patch) =>
    fetch(`${BASE}/schedule/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then(handle),

  deleteScheduleEntry: (entryId) =>
    fetch(`${BASE}/schedule/${entryId}`, { method: "DELETE" }).then(handle),

  unscheduleWorkPackage: (wpId) =>
    fetch(`${BASE}/schedule/by_wp/${wpId}`, { method: "DELETE" }).then(handle),
};

export { ApiError };
