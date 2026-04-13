"use client";
import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
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
import BasesPartesModule from "@/components/BasesPartesModule";
import ParaFirmarModule from "@/components/ParaFirmarModule";
import DashboardOverview from "@/components/DashboardOverview";
import Notification from "@/components/Notification";
import { supabase } from "@/lib/supabaseClient";
import { syncDelegacionesFromFlagranciaGlobal } from "@/components/DelegacionesFlagranciaModule";
import { syncArchDeleFromFlagranciaGlobal } from "@/components/ArchivoDelegacionesModule";

// Definición estricta de tipos
type ActiveModule = "dashboard" | "delegaciones" | "delegaciones_diarias" | "partes" | "partes_viejos" | "archivo_delegaciones";
type ViewMode = "add" | "edit" | "download" | "delegaciones_flagrancia" | "para_firmar" | "bases_partes";

export default function Home() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeModule, setActiveModule] = useState<ActiveModule>("dashboard");
  const [view, setView] = useState<ViewMode>("add"); 
  const [syncingAllTables, setSyncingAllTables] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);
  const openSidebarButtonRef = useRef<HTMLButtonElement | null>(null);
  const allowedEmail = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL || "").trim().toLowerCase();
  const deploymentVersionRaw = (
    process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || ""
  ).trim();
  const deploymentVersion = deploymentVersionRaw
    ? deploymentVersionRaw.slice(0, 7).toUpperCase()
    : "SIN-TAG";

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
    let isMounted = true;

    const bootstrapSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        setNotification({ message: `No se pudo validar la sesión: ${error.message}`, type: "error" });
      }

      setSession(data.session ?? null);
      setAuthChecking(false);
    };

    void bootstrapSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;

      const nextEmail = nextSession?.user?.email?.toLowerCase() || "";
      if (allowedEmail && nextSession && nextEmail !== allowedEmail) {
        void supabase.auth.signOut();
        setSession(null);
        setNotification({ message: "Este usuario no tiene permiso para ingresar.", type: "error" });
        setAuthChecking(false);
        return;
      }

      setSession(nextSession);
      setAuthChecking(false);
    });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  const handleAuthSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setNotification({ message: "Debes ingresar correo y contraseña.", type: "info" });
      return;
    }

    if (allowedEmail && email.trim().toLowerCase() !== allowedEmail) {
      setNotification({ message: "Este correo no está autorizado.", type: "error" });
      return;
    }

    setAuthLoading(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setAuthLoading(false);

    if (error) {
      setNotification({ message: `Error de inicio de sesión: ${error.message}`, type: "error" });
      return;
    }

    setNotification({ message: "Sesión iniciada con éxito.", type: "success" });
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setNotification({ message: `No se pudo cerrar sesión: ${error.message}`, type: "error" });
      return;
    }

    setNotification({ message: "Sesión cerrada.", type: "info" });
  };

  useEffect(() => {
    if (!isSidebarOpen) return;

    const closeSidebar = () => {
      setIsSidebarOpen(false);
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      const clickedInsideSidebar = sidebarRef.current?.contains(target);
      const clickedOpenButton = openSidebarButtonRef.current?.contains(target);

      if (!clickedInsideSidebar && !clickedOpenButton) {
        closeSidebar();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isSidebarOpen]);

  if (authChecking) {
    return (
      <main className="relative flex h-screen w-full overflow-hidden p-4 gap-4 bg-slate-950 items-center justify-center">
        <Background />
        <div className="relative z-10 bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl px-8 py-6 text-center">
          <p className="text-white font-semibold">Verificando sesión...</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="relative flex h-screen w-full overflow-hidden p-4 gap-4 bg-slate-950 items-center justify-center">
        <Background />

        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}

        <section className="relative z-10 w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 space-y-6">
          <header className="text-center space-y-2">
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">Acceso Seguro</h1>
            <p className="text-xs text-white/50 uppercase tracking-wide">Documentos Plus</p>
          </header>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">Correo</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                placeholder="usuario@correo.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                placeholder="********"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full px-4 py-3 rounded-xl font-black text-[11px] uppercase bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {authLoading ? "Procesando..." : "Ingresar"}
            </button>
          </form>
        </section>
      </main>
    );
  }

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
        <div className="absolute top-2 right-2 z-50 flex items-center gap-3 bg-white/10 border border-white/20 rounded-xl px-3 py-2 backdrop-blur-md">
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] text-white/70 font-semibold max-w-[180px] truncate">{session.user.email}</span>
            <span className="text-[9px] text-cyan-200/90 font-bold tracking-wide uppercase">Actualizacion: {deploymentVersion}</span>
          </div>
          <button
            onClick={() => void handleSignOut()}
            className="text-[10px] uppercase font-bold text-red-300 hover:text-red-200"
          >
            Salir
          </button>
        </div>

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
              {activeModule === "dashboard"
                ? "Dashboard Ejecutivo"
                : activeModule === "delegaciones"
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

          {activeModule !== "archivo_delegaciones" && activeModule !== "dashboard" && (
            <ControlPanel 
              activeView={view}
              onAdd={() => setView("add")}
              onEdit={() => setView("edit")}
              onDownload={() => setView("download")}
              onDelegacionesFlagrancia={() => setView("delegaciones_flagrancia")}
              showDelegacionesFlagrancia={activeModule === "delegaciones_diarias"}
              onBasesPartes={() => setView("bases_partes")}
              showBasesPartes={activeModule === "partes" || activeModule === "partes_viejos"}
              onParaFirmar={() => setView("para_firmar")}
              showParaFirmar={activeModule === "delegaciones_diarias"}
            />
          )}

          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar mt-6">
            {activeModule === "dashboard" && <DashboardOverview />}

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
                ? <EditPartes sourceTable="partes_viejas" />
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
                ? <DownloadPartes sourceTable="partes_viejas" />
                : activeModule === "archivo_delegaciones"
                ? null
                : <DownloadModule />
            )}
            {view === "delegaciones_flagrancia" && activeModule === "delegaciones_diarias" && (
              <DelegacionesFlagranciaModule />
            )}
            {view === "para_firmar" && activeModule === "delegaciones_diarias" && (
              <ParaFirmarModule />
            )}
            {view === "bases_partes" && activeModule === "partes" && (
              <BasesPartesModule sourceTable="PARTES" title="Partes" />
            )}
            {view === "bases_partes" && activeModule === "partes_viejos" && (
              <BasesPartesModule sourceTable="partes_viejas" title="Partes Viejos" />
            )}
          </div>
        </div>
      </section>
    </main>
  );
}