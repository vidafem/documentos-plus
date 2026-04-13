"use client";

import type { RefObject } from "react";

type ActiveModule = "dashboard" | "delegaciones" | "delegaciones_diarias" | "partes" | "partes_viejos" | "archivo_delegaciones";

interface SidebarProps {
  sidebarRef: RefObject<HTMLElement | null>;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeModule: ActiveModule;
  setActiveModule: (module: ActiveModule) => void;
  onSyncAllTables: () => void;
  syncingAllTables: boolean;
}

export default function Sidebar({
  sidebarRef,
  isOpen,
  setIsOpen,
  activeModule,
  setActiveModule,
  onSyncAllTables,
  syncingAllTables,
}: SidebarProps) {
  return (
    <aside ref={sidebarRef} className={`absolute left-0 top-0 z-40 h-full transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)] flex flex-col ${
      isOpen ? "w-80 opacity-100 translate-x-0" : "w-80 opacity-0 -translate-x-6 pointer-events-none"
    }`}>
      <div className="liquid-glass h-full w-full rounded-[2.5rem] flex flex-col p-6 overflow-hidden bg-slate-950/55 backdrop-blur-2xl border border-cyan-300/15 shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
        <div className="flex items-center justify-between mb-10 px-2">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-tight text-white/90">DocuPlus</h1>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Policía Judicial</span>
          </div>
          <button onClick={() => setIsOpen(false)} className="glass-btn p-2 rounded-full text-white/50 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </div>
        
        <nav className="flex-1 space-y-3">
          <button
            onClick={() => setActiveModule("dashboard")}
            className={`w-full glass-btn p-4 rounded-3xl cursor-pointer font-semibold flex items-center gap-4 transition-all ${activeModule === "dashboard" ? "bg-cyan-500/20 border-cyan-300/30 text-cyan-100" : "text-white/40 border-transparent"}`}
          >
            <span className="text-xl">📈</span> Dashboard
          </button>
          <button
            onClick={() => setActiveModule("delegaciones_diarias")}
            className={`w-full glass-btn p-4 rounded-3xl cursor-pointer font-semibold flex items-center gap-4 transition-all ${activeModule === "delegaciones_diarias" ? "bg-white/10 border-white/20 text-white" : "text-white/40 border-transparent"}`}
          >
            <span className="text-xl">📝</span> Delegaciones Diarias
          </button>
          <button
            onClick={() => setActiveModule("archivo_delegaciones")}
            className={`w-full glass-btn p-4 rounded-3xl cursor-pointer font-semibold flex items-center gap-4 transition-all ${activeModule === "archivo_delegaciones" ? "bg-white/10 border-white/20 text-white" : "text-white/40 border-transparent"}`}
          >
            <span className="text-xl">🗂️</span> Archivo Delegaciones
          </button>
          <button 
            onClick={() => setActiveModule("partes")}
            className={`w-full glass-btn p-4 rounded-3xl cursor-pointer font-semibold flex items-center gap-4 transition-all ${activeModule === "partes" ? "bg-white/10 border-white/20 text-white" : "text-white/40 border-transparent"}`}
          >
            <span className="text-xl">🗃️</span> Partes
          </button>
          <button
            onClick={() => setActiveModule("delegaciones")}
            className={`w-full glass-btn p-4 rounded-3xl cursor-pointer font-semibold flex items-center gap-4 transition-all ${activeModule === "delegaciones" ? "bg-white/10 border-white/20 text-white" : "text-white/40 border-transparent"}`}
          >
            <span className="text-xl">🗄️</span> Delegaciones Viejas
          </button>
          <button 
            onClick={() => setActiveModule("partes_viejos")}
            className={`w-full glass-btn p-4 rounded-3xl cursor-pointer font-semibold flex items-center gap-4 transition-all ${activeModule === "partes_viejos" ? "bg-white/10 border-white/20 text-white" : "text-white/40 border-transparent"}`}
          >
            <span className="text-xl">🧾</span> Partes Viejos
          </button>
        </nav>

        <div className="pt-4 border-t border-white/10">
          <button
            onClick={onSyncAllTables}
            disabled={syncingAllTables}
            className="w-full glass-btn p-4 rounded-3xl cursor-pointer font-semibold flex items-center justify-center gap-3 transition-all bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {syncingAllTables ? "Actualizando tablas..." : "Actualizar tablas"}
          </button>
          <p className="mt-2 text-[10px] text-white/40 text-center uppercase tracking-wide">
            Actualiza DELEGACIONES y Arch_dele (no modifica FLAGRANCIA)
          </p>
        </div>
      </div>
    </aside>
  );
}