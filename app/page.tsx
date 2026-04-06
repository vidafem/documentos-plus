"use client";
import { useEffect, useRef, useState } from "react";
import Background from "@/components/Background";
import Sidebar from "@/components/Sidebar";
import ControlPanel from "@/components/ControlPanel";
import FormDelegaciones from "@/components/FormDelegaciones";
import FormDelegacionesDiarias from "@/components/FormDelegacionesDiarias";
import FormPartes from "@/components/FormPartes";
import FormPartesNuevo from "@/components/FormPartesNuevo";
import EditModule from "@/components/EditModule";
import EditPartes from "@/components/EditPartes";
import EditFlagranciaModule from "@/components/EditFlagranciaModule";
import DownloadModule from "@/components/DownloadModule";
import DownloadPartes from "@/components/DownloadPartes";
import DownloadFlagranciaModule from "@/components/DownloadFlagranciaModule";
import DelegacionesFlagranciaModule from "@/components/DelegacionesFlagranciaModule";
import ArchivoDelegacionesModule from "@/components/ArchivoDelegacionesModule";
import Notification from "@/components/Notification";
import { syncDelegacionesFromFlagranciaGlobal } from "@/components/DelegacionesFlagranciaModule";
import { syncArchDeleFromFlagranciaGlobal } from "@/components/ArchivoDelegacionesModule";

// Definición estricta de tipos
type ActiveModule = "delegaciones" | "delegaciones_diarias" | "partes" | "partes_viejos" | "archivo_delegaciones";
type ViewMode = "add" | "edit" | "download" | "delegaciones_flagrancia";

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeModule, setActiveModule] = useState<ActiveModule>("delegaciones");
  const [view, setView] = useState<ViewMode>("add"); 
  const [syncingAllTables, setSyncingAllTables] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const openSidebarButtonRef = useRef<HTMLButtonElement | null>(null);

  const handleSyncAllTables = async () => {
    if (syncingAllTables) return;

    setSyncingAllTables(true);
    setNotification({ message: "Sincronizando tablas derivadas desde FLAGRANCIA...", type: "info" });

    try {
      const delegaciones = await syncDelegacionesFromFlagranciaGlobal(2026);
      const archDele = await syncArchDeleFromFlagranciaGlobal();

      setNotification({
        message: `Actualización completa: DELEGACIONES ${delegaciones.updatedCount} filas, Arch_dele ${archDele.dedupedCount} filas.`,
        type: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al actualizar tablas.";
      setNotification({ message, type: "error" });
    } finally {
      setSyncingAllTables(false);
    }
  };

  useEffect(() => {
    if (!isSidebarOpen) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const closeSidebar = () => {
      setIsSidebarOpen(false);
    };

    const resetAutoClose = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(closeSidebar, 3000);
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const clickedInsideSidebar = sidebarRef.current?.contains(target);
      const clickedOpenButton = openSidebarButtonRef.current?.contains(target);

      if (!clickedInsideSidebar && !clickedOpenButton) {
        closeSidebar();
        return;
      }

      resetAutoClose();
    };

    const handleActivity = () => {
      resetAutoClose();
    };

    resetAutoClose();
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("mousemove", handleActivity);
    document.addEventListener("keydown", handleActivity);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("mousemove", handleActivity);
      document.removeEventListener("keydown", handleActivity);
    };
  }, [isSidebarOpen]);

  return (
    <main className="relative flex h-screen w-full overflow-hidden p-4 gap-4 bg-slate-950">
      <Background />
      
      {/* Pasamos los estados con tipos coherentes */}
      <Sidebar 
        sidebarRef={sidebarRef}
        isOpen={isSidebarOpen} 
        setIsOpen={setIsSidebarOpen} 
        activeModule={activeModule} 
        setActiveModule={setActiveModule}
        onSyncAllTables={handleSyncAllTables}
        syncingAllTables={syncingAllTables}
      />

      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <section className="flex-1 min-w-0 flex flex-col h-full relative z-10 transition-all duration-300">
        {!isSidebarOpen && (
          <button 
            ref={openSidebarButtonRef}
            onClick={() => setIsSidebarOpen(true)} 
            className="absolute top-2 left-0 z-50 bg-white/10 backdrop-blur-md p-3 rounded-xl text-white shadow-2xl hover:scale-105 active:scale-95 transition-all border border-white/20"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        )}

        <div className="flex-1 min-w-0 bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] flex flex-col p-8 overflow-hidden">
          <header className="mb-6 text-center">
            <h2 className="text-2xl font-bold tracking-tight text-white uppercase">
              {activeModule === "delegaciones"
                ? "Delegaciones Viejas"
                : activeModule === "delegaciones_diarias"
                ? "Delegaciones Diarias"
                : activeModule === "partes"
                ? "Partes Policiales"
                : activeModule === "partes_viejos"
                ? "Partes Viejos"
                : "Archivo Delegaciones"}
            </h2>
            <p className="text-[10px] text-white/30 font-bold tracking-[0.2em] uppercase">
              Policía Judicial - Gestión de Archivo
            </p>
          </header>

          {activeModule !== "archivo_delegaciones" && (
            <ControlPanel 
              activeView={view}
              onAdd={() => setView("add")}
              onEdit={() => setView("edit")}
              onDownload={() => setView("download")}
              onDelegacionesFlagrancia={() => setView("delegaciones_flagrancia")}
              showDelegacionesFlagrancia={activeModule === "delegaciones_diarias"}
            />
          )}

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar mt-6">
            {activeModule === "archivo_delegaciones" && <ArchivoDelegacionesModule />}

            {view === "add" && (
              activeModule === "delegaciones"
                ? <FormDelegaciones key="del" />
                : activeModule === "delegaciones_diarias"
                ? <FormDelegacionesDiarias key="deldia" />
                : activeModule === "partes"
                ? <FormPartesNuevo key="par_new" />
                : activeModule === "partes_viejos"
                ? <FormPartes key="par" />
                : null
            )}

            {view === "edit" && (
              activeModule === "delegaciones_diarias"
                ? <EditFlagranciaModule />
                : activeModule === "partes"
                ? <EditPartes />
                : activeModule === "partes_viejos"
                ? <EditModule />
                : activeModule === "archivo_delegaciones"
                ? null
                : <EditModule />
            )}
            {view === "download" && (
              activeModule === "delegaciones_diarias"
                ? <DownloadFlagranciaModule />
                : activeModule === "partes"
                ? <DownloadPartes />
                : activeModule === "partes_viejos"
                ? <DownloadModule />
                : activeModule === "archivo_delegaciones"
                ? null
                : <DownloadModule />
            )}
            {view === "delegaciones_flagrancia" && activeModule === "delegaciones_diarias" && (
              <DelegacionesFlagranciaModule />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}