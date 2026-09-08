"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

interface PresenceData {
  recordKey: string | null;
  startedAt: number;
}

const getBrowserSessionId = (): string => {
  if (typeof window === "undefined") return "server_session";
  try {
    let id = window.sessionStorage.getItem("docuplus_session_id");
    if (!id) {
      id = "client_" + Math.random().toString(36).substring(2, 10) + "_" + Date.now();
      window.sessionStorage.setItem("docuplus_session_id", id);
    }
    return id;
  } catch {
    return "session_" + Math.random().toString(36).substring(2, 10);
  }
};

/**
 * Hook para gestionar bloqueos en vivo de registros abiertos en edición.
 * Previene que dos personas editen el mismo registro al mismo tiempo.
 */
export function useRecordLock() {
  const sessionIdRef = useRef<string>("");
  const activeLockRef = useRef<string | null>(null);
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    sessionIdRef.current = getBrowserSessionId();
    const currentSessionId = sessionIdRef.current;

    const channel = supabase.channel("docuplus_record_locks", {
      config: {
        presence: {
          key: currentSessionId,
        },
      },
    });

    channelRef.current = channel;

    const updateLocks = () => {
      const state = channel.presenceState<PresenceData>();
      const currentLocks = new Set<string>();

      for (const [key, presences] of Object.entries(state)) {
        // Ignoramos las cerraduras de esta misma pestaña
        if (key === currentSessionId) continue;

        for (const presence of presences) {
          if (presence.recordKey) {
            currentLocks.add(presence.recordKey);
          }
        }
      }

      setLockedKeys(currentLocks);
    };

    channel
      .on("presence", { event: "sync" }, updateLocks)
      .on("presence", { event: "join" }, updateLocks)
      .on("presence", { event: "leave" }, updateLocks)
      .subscribe();

    const handleBeforeUnload = () => {
      if (activeLockRef.current && channelRef.current) {
        try {
          void channelRef.current.untrack();
        } catch {
          // ignore cleanup error
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (activeLockRef.current && channelRef.current) {
        try {
          void channelRef.current.untrack();
        } catch {
          // ignore
        }
      }
      try {
        void channel.unsubscribe();
      } catch {
        // ignore
      }
    };
  }, []);

  /**
   * Verifica si un registro específico está siendo editado por otra persona.
   */
  const isLockedByOther = useCallback(
    (table: string, id: string | number | undefined | null): boolean => {
      if (id === undefined || id === null) return false;
      const key = `${table}:${id}`;
      return lockedKeys.has(key);
    },
    [lockedKeys]
  );

  /**
   * Intenta adquirir el bloqueo para editar un registro.
   * Retorna { ok: true } si se pudo bloquear, o { ok: false, message: string } si ya está ocupado.
   */
  const requestLock = useCallback(
    async (
      table: string,
      id: string | number | undefined | null
    ): Promise<{ ok: boolean; message?: string }> => {
      if (id === undefined || id === null) {
        return { ok: true };
      }

      const key = `${table}:${id}`;

      // Verificar si otra pestaña/usuario lo tiene bloqueado
      if (lockedKeys.has(key)) {
        return {
          ok: false,
          message: "Este registro ya está siendo editado por otro usuario en este momento.",
        };
      }

      // Adquirir bloqueo emitiendo presencia
      activeLockRef.current = key;
      if (channelRef.current) {
        try {
          await channelRef.current.track({
            recordKey: key,
            startedAt: Date.now(),
          });
        } catch (err) {
          console.warn("[RecordLock] No se pudo emitir presencia:", err);
        }
      }

      return { ok: true };
    },
    [lockedKeys]
  );

  /**
   * Libera el bloqueo del registro actual cuando se termina de editar o se cancela.
   */
  const releaseLock = useCallback(async () => {
    if (!activeLockRef.current) return;
    activeLockRef.current = null;

    if (channelRef.current) {
      try {
        await channelRef.current.track({
          recordKey: null,
          startedAt: 0,
        });
      } catch (err) {
        console.warn("[RecordLock] No se pudo liberar presencia:", err);
      }
    }
  }, []);

  return {
    isLockedByOther,
    requestLock,
    releaseLock,
  };
}
