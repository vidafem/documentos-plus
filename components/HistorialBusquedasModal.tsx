"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import ConfirmModal from "./ConfirmModal";
import Notification from "./Notification";
import {
  LogBusquedaItem,
  obtenerHistorialBusquedas,
  eliminarTodoHistorialBusquedas,
  eliminarLogIndividual,
} from "@/lib/searchLogger";

type HistorialBusquedasModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function HistorialBusquedasModal({ isOpen, onClose }: HistorialBusquedasModalProps) {
  const [logs, setLogs] = useState<LogBusquedaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Filtros
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "exitosa" | "normal">("todos");
  const [filtroModulo, setFiltroModulo] = useState<string>("todos");

  // Confirmación de eliminación
  const [showConfirmDeleteAll, setShowConfirmDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const cargarLogs = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await obtenerHistorialBusquedas(1000);
    setLoading(false);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setLogs(res.data);
    }
  };

  useEffect(() => {
    if (isOpen) {
      void cargarLogs();
    }
  }, [isOpen]);

  // Lista de módulos únicos para el selector
  const modulosDisponibles = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.modulo) set.add(l.modulo);
    });
    return Array.from(set).sort();
  }, [logs]);

  // Registros filtrados
  const logsFiltrados = useMemo(() => {
    const q = filtroTexto.trim().toLowerCase();
    return logs.filter((item) => {
      if (filtroEstado !== "todos" && item.estado !== filtroEstado) return false;
      if (filtroModulo !== "todos" && item.modulo !== filtroModulo) return false;

      if (!q) return true;

      const num = String(item.numero || "").toLowerCase();
      const det = String(item.detenidos || "").toLowerCase();
      const del = String(item.delito || "").toLowerCase();
      const mod = String(item.modulo || "").toLowerCase();
      const crit = String(item.criterio || "").toLowerCase();

      return num.includes(q) || det.includes(q) || del.includes(q) || mod.includes(q) || crit.includes(q);
    });
  }, [logs, filtroTexto, filtroEstado, filtroModulo]);

  // Estadísticas
  const stats = useMemo(() => {
    const total = logs.length;
    const exitosas = logs.filter((l) => l.estado === "exitosa").length;
    const normales = logs.filter((l) => l.estado === "normal").length;
    return { total, exitosas, normales };
  }, [logs]);

  const handleExportExcel = () => {
    if (logsFiltrados.length === 0) {
      setNotification({ message: "No hay registros para exportar con los filtros actuales.", type: "info" });
      return;
    }

    const excelData = logsFiltrados.map((item) => ({
      "FECHA / HORA": item.created_at ? new Date(item.created_at).toLocaleString("es-EC") : "",
      "MÓDULO / ORIGEN": item.modulo || "",
      "NÚMERO BUSCADO": item.numero || "",
      "CRITERIO": item.criterio || "",
      "ESTADO": item.estado === "exitosa" ? "EXITOSA" : "NORMAL",
      "TOTAL RESULTADOS": item.total_encontrados ?? 0,
      "DETENIDOS": item.detenidos || "",
      "DELITO": item.delito || "",
      "USUARIO": item.usuario || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "LOGS_BUSQUEDAS");

    worksheet["!cols"] = [
      { wch: 20 },
      { wch: 22 },
      { wch: 24 },
      { wch: 16 },
      { wch: 12 },
      { wch: 16 },
      { wch: 45 },
      { wch: 45 },
      { wch: 20 },
    ];

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `HISTORIAL_BUSQUEDAS_${stamp}.xlsx`);
    setNotification({ message: "Archivo Excel descargado con éxito.", type: "success" });
  };

  const handleConfirmDeleteAll = async () => {
    setDeleting(true);
    const res = await eliminarTodoHistorialBusquedas();
    setDeleting(false);
    setShowConfirmDeleteAll(false);

    if (res.ok) {
      setLogs([]);
      setNotification({ message: "Se ha eliminado todo el historial de búsquedas.", type: "success" });
    } else {
      setNotification({ message: `Error al eliminar historial: ${res.error}`, type: "error" });
    }
  };

  const handleDeleteItem = async (id?: string) => {
    if (!id) return;
    const res = await eliminarLogIndividual(id);
    if (res.ok) {
      setLogs((prev) => prev.filter((item) => item.id !== id));
      setNotification({ message: "Registro eliminado", type: "success" });
    } else {
      setNotification({ message: `Error al eliminar registro: ${res.error}`, type: "error" });
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {showConfirmDeleteAll && (
        <ConfirmModal
          title="¿Eliminar todo el historial de búsquedas?"
          message="Esta acción vaciará permanentemente todos los registros y logs de búsquedas almacenados en Supabase. Esta operación no se puede deshacer."
          onConfirm={() => void handleConfirmDeleteAll()}
          onCancel={() => setShowConfirmDeleteAll(false)}
        />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-neutral-950/95 border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden">
          {/* CABECERA */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(99,102,241,0.25)]">
                📋
              </div>
              <div>
                <h2 className="text-sm md:text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
                  Historial y Logs de Búsquedas
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono">
                    {stats.total} total
                  </span>
                </h2>
                <p className="text-[11px] text-white/40">
                  Registro de consultas a Fiscalía y búsquedas en delegaciones y partes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => void cargarLogs()}
                disabled={loading}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white/70 hover:text-white transition-all flex items-center gap-1.5"
                title="Recargar datos"
              >
                <span className={loading ? "animate-spin" : ""}>⟳</span>
                <span className="hidden sm:inline text-[10px] font-bold uppercase">Actualizar</span>
              </button>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white flex items-center justify-center transition-all text-sm font-bold"
                title="Cerrar ventana"
              >
                ✕
              </button>
            </div>
          </div>

          {/* CONTADORES RÁPIDOS */}
          <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-white/5 bg-white/[0.01]">
            <div className="p-3 rounded-2xl bg-white/5 border border-white/5 flex flex-col">
              <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Total Búsquedas</span>
              <span className="text-lg font-black text-white font-mono">{stats.total}</span>
            </div>
            <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col">
              <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Búsquedas Exitosas</span>
              <span className="text-lg font-black text-emerald-300 font-mono">{stats.exitosas}</span>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col">
              <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">Búsquedas Normales</span>
              <span className="text-lg font-black text-amber-300 font-mono">{stats.normales}</span>
            </div>
          </div>

          {/* MENSAJE DE TABLA FALTANTE EN SUPABASE */}
          {errorMsg && (
            <div className="m-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <span>⚠️ Aviso de Base de Datos:</span>
                <span>{errorMsg}</span>
              </div>
              <p className="text-[11px] text-white/70">
                Si aún no has creado la tabla <code className="bg-black/50 px-1 py-0.5 rounded text-amber-300 font-mono">historial_busquedas</code> en Supabase, ejecuta esta instrucción en el <strong>SQL Editor</strong> de tu proyecto Supabase:
              </p>
              <pre className="p-3 rounded-xl bg-black/80 text-[10px] text-emerald-300 font-mono overflow-x-auto select-all border border-white/10">
{`CREATE TABLE IF NOT EXISTS public.historial_busquedas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  modulo TEXT NOT NULL,
  numero TEXT NOT NULL,
  criterio TEXT,
  detenidos TEXT,
  delito TEXT,
  estado TEXT NOT NULL DEFAULT 'normal',
  total_encontrados INTEGER DEFAULT 0,
  usuario TEXT
);
ALTER TABLE public.historial_busquedas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir todo a usuarios anon/auth" ON public.historial_busquedas FOR ALL USING (true) WITH CHECK (true);`}
              </pre>
            </div>
          )}

          {/* BARRA DE FILTROS Y ACCIONES */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 border-b border-white/5 bg-white/[0.02]">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
              {/* Buscador de texto */}
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <input
                  type="text"
                  value={filtroTexto}
                  onChange={(e) => setFiltroTexto(e.target.value)}
                  placeholder="🔍 Filtrar por número, detenido o delito..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-indigo-500 transition-all"
                />
                {filtroTexto && (
                  <button
                    onClick={() => setFiltroTexto("")}
                    className="absolute right-2 top-1.5 text-white/40 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Selector de Estado */}
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value as "todos" | "exitosa" | "normal")}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
              >
                <option value="todos" className="bg-neutral-900 text-white">Todos los estados</option>
                <option value="exitosa" className="bg-neutral-900 text-emerald-400">Solo exitosas</option>
                <option value="normal" className="bg-neutral-900 text-amber-300">Solo normales</option>
              </select>

              {/* Selector de Módulo */}
              <select
                value={filtroModulo}
                onChange={(e) => setFiltroModulo(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 max-w-[180px]"
              >
                <option value="todos" className="bg-neutral-900 text-white">Todos los módulos</option>
                {modulosDisponibles.map((mod) => (
                  <option key={mod} value={mod} className="bg-neutral-900 text-white">
                    {mod}
                  </option>
                ))}
              </select>
            </div>

            {/* BOTONES DE ACCIÓN: EXCEL Y ELIMINAR */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-wider transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 flex items-center gap-1.5"
                title="Descargar tabla filtrada en formato Excel"
              >
                <span>📊</span>
                <span>Descargar Excel</span>
              </button>

              <button
                type="button"
                onClick={() => setShowConfirmDeleteAll(true)}
                disabled={logs.length === 0}
                className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 text-[11px] font-bold uppercase tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
                title="Eliminar permanentemente todos los logs de búsquedas"
              >
                <span>🗑️</span>
                <span>Vaciar Todo</span>
              </button>
            </div>
          </div>

          {/* TABLA DE RESULTADOS */}
          <div className="flex-1 overflow-auto custom-scrollbar p-6">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-neutral-900 text-white/50 uppercase font-black text-[9px] tracking-wider z-10 border-b border-white/10">
                  <tr>
                    <th className="p-3">Fecha y Hora</th>
                    <th className="p-3">Módulo</th>
                    <th className="p-3">Número Buscado</th>
                    <th className="p-3">Criterio</th>
                    <th className="p-3 text-center">Estado</th>
                    <th className="p-3">Detenidos</th>
                    <th className="p-3">Delito</th>
                    <th className="p-3 text-center w-12">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80 text-[11px]">
                  {loading && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-white/40">
                        <span className="inline-block animate-spin mr-2">⟳</span>
                        Cargando historial de búsquedas...
                      </td>
                    </tr>
                  )}

                  {!loading && logsFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-white/40">
                        {logs.length === 0
                          ? "No hay búsquedas registradas en el historial aún."
                          : "No se encontraron búsquedas con los filtros seleccionados."}
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    logsFiltrados.map((item, idx) => {
                      const fechaStr = item.created_at
                        ? new Date(item.created_at).toLocaleString("es-EC", {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "S/F";

                      return (
                        <tr key={item.id || idx} className="hover:bg-white/[0.03] transition-colors">
                          <td className="p-3 font-mono text-white/50 text-[10px] whitespace-nowrap">
                            {fechaStr}
                          </td>
                          <td className="p-3 font-bold text-indigo-300 whitespace-nowrap">
                            {item.modulo}
                          </td>
                          <td className="p-3 font-mono font-bold text-white whitespace-nowrap">
                            {item.numero}
                          </td>
                          <td className="p-3 text-white/60 whitespace-nowrap">
                            {item.criterio || "General"}
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            {item.estado === "exitosa" ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold text-[9px] uppercase tracking-wider">
                                Exitosa
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-bold text-[9px] uppercase tracking-wider">
                                Normal
                              </span>
                            )}
                          </td>
                          <td className="p-3 max-w-xs truncate" title={item.detenidos || "Sin detenidos"}>
                            {item.detenidos ? (
                              <span className="text-white/90">{item.detenidos}</span>
                            ) : (
                              <span className="text-white/20 italic">Ninguno</span>
                            )}
                          </td>
                          <td className="p-3 max-w-xs truncate" title={item.delito || "Sin delito"}>
                            {item.delito ? (
                              <span className="text-white/90">{item.delito}</span>
                            ) : (
                              <span className="text-white/20 italic">Sin registro</span>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            {item.id && (
                              <button
                                onClick={() => void handleDeleteItem(item.id)}
                                className="w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors flex items-center justify-center text-[10px]"
                                title="Eliminar este registro"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {/* PIE DEL MODAL */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-white/10 bg-white/[0.02] text-[10px] text-white/40">
            <span>
              Mostrando {logsFiltrados.length} de {logs.length} búsquedas
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold uppercase transition-all"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
