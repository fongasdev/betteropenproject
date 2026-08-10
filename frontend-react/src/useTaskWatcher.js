import { useEffect, useRef } from "react";
import { api } from "./api.js";
import { playNotificationSound } from "./utils.js";

const POLL_MS = 60_000;

/**
 * Observa TODAS as minhas tarefas (independente dos filtros da tela) a cada
 * 60s e dispara som + toast quando alguém além de mim muda o status ou
 * adiciona um comentário. Não notifica mudanças feitas por mim mesmo.
 */
export function useTaskWatcher({ me, enabled, onEvents }) {
  const seenRef = useRef(new Map()); // wpId -> { status, updatedAt, lastActivityId }
  const initializedRef = useRef(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!enabled || !me) return;

    let cancelled = false;

    async function seedActivity(wp) {
      try {
        const acts = await api.activities(wp.id);
        const lastId = acts.reduce((max, a) => Math.max(max, a.id || 0), 0);
        return lastId;
      } catch (e) {
        return 0;
      }
    }

    async function poll() {
      let list;
      try {
        list = await api.workPackages(true);
      } catch (e) {
        return; // falha de rede/API — tenta de novo no próximo ciclo
      }
      if (cancelled) return;

      const isFirst = !initializedRef.current;
      const prevMap = seenRef.current;
      const nextMap = new Map();
      const events = [];

      for (const wp of list) {
        const prev = prevMap.get(wp.id);

        if (!prev) {
          // Tarefa nova para nós: cria baseline. Notifica "nova tarefa" só
          // depois da primeira carga (evita barulho ao abrir o app).
          const lastActivityId = await seedActivity(wp);
          nextMap.set(wp.id, { status: wp.status, updatedAt: wp.updatedAt, lastActivityId });
          if (!isFirst) events.push({ type: "assigned", wp });
          continue;
        }

        let lastActivityId = prev.lastActivityId;

        if (prev.updatedAt !== wp.updatedAt) {
          try {
            const acts = await api.activities(wp.id);
            const newActs = acts.filter((a) => a.id > (prev.lastActivityId || 0));
            for (const a of newActs) {
              if (a.userId && me.id && a.userId === me.id) continue; // fui eu
              if (a.statusChanged) events.push({ type: "status", wp, activity: a });
              else if (a.comment) events.push({ type: "comment", wp, activity: a });
            }
            lastActivityId = acts.reduce((max, a) => Math.max(max, a.id || 0), lastActivityId || 0);
          } catch (e) {
            /* ignora falha pontual */
          }
        }

        nextMap.set(wp.id, { status: wp.status, updatedAt: wp.updatedAt, lastActivityId });
      }

      seenRef.current = nextMap;
      initializedRef.current = true;

      if (events.length > 0 && !isFirst) {
        playNotificationSound();
        onEvents(events);
      }
    }

    poll();
    intervalRef.current = setInterval(poll, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalRef.current);
    };
  }, [enabled, me, onEvents]);
}
