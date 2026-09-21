"use client";

import React, { useState, useEffect } from "react";

export default function PanelDiagnosticoFiscalia() {
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "online" | "warning" | "offline">("checking");
  const [latency, setLatency] = useState<number | null>(null);
  const [proxyMode, setProxyMode] = useState<string>("Cloudflare");
  const [isTesting, setIsTesting] = useState(false);
  const [testValor, setTestValor] = useState("2026020206123363816");
  const [testCriterio, setTestCriterio] = useState("6"); // 6: Oficio, 2: Cédula
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev]);
  };

  // Función de verificación de estado y ping
  const checkHealth = async () => {
    setConnectionStatus("checking");
    addLog("Verificando estado de conexión con Fiscalía y Cloudflare...");
    const start = Date.now();
    try {
      const res = await fetch("/api/consulta-fiscalia?ping=1", { cache: "no-store" });
      const elapsed = Date.now() - start;
      setLatency(elapsed);

      if (res.ok) {
        const json = await res.json();
        if (json.proxyConfigured && json.proxyStatus === "online") {
          setConnectionStatus("online");
          setProxyMode("Cloudflare Proxy (Activo)");
          addLog(`🟢 Conexión con Cloudflare Proxy verificada con éxito (${elapsed}ms).`);
        } else if (json.proxyConfigured) {
          setConnectionStatus("warning");
          setProxyMode(`Cloudflare Proxy (${json.proxyStatus})`);
          addLog(`⚠️ Cloudflare Proxy configurado pero devolvió estado: ${json.proxyStatus}.`);
        } else {
          setConnectionStatus("online");
          setProxyMode("Conexión Directa");
          addLog(`🟢 Conexión directa con Fiscalía activa (${elapsed}ms).`);
        }
      } else {
        setConnectionStatus("offline");
        addLog(`🔴 El servidor respondió con estado HTTP ${res.status}.`);
      }
    } catch (err) {
      setConnectionStatus("offline");
      addLog("❌ Error de red al verificar conexión: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const handleClearLogs = () => setLogs([]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    alert("¡Logs copiados al portapapeles!");
  };

  // Ejecución de prueba con diagnóstico profundo y logs
  const handleTestConnection = async () => {
    if (!testValor.trim()) {
      alert("Ingresa un número para probar.");
      return;
    }

    setIsTesting(true);
    addLog(`Iniciando prueba de consulta (Criterio: ${testCriterio === "6" ? "Oficio" : "Cédula"}, Valor: ${testValor})...`);

    const start = Date.now();
    try {
      const endpoint = `/api/consulta-fiscalia?criterio=${testCriterio}&valor=${encodeURIComponent(testValor)}`;
      addLog(`🌐 GET ${endpoint}`);

      const res = await fetch(endpoint, { cache: "no-store" });
      const elapsed = Date.now() - start;
      const text = await res.text();
      addLog(`HTTP Status: ${res.status} (${elapsed}ms)`);

      try {
        const json = JSON.parse(text);
        if (json.success && json.found) {
          setConnectionStatus("online");
          addLog("✅ [ÉXITO] Registro encontrado en Fiscalía:");
          addLog(`   Delito: ${json.delito}`);
          addLog(`   Detenido(s): ${json.detenidos}`);
          addLog(`   NDD: ${json.ndd}`);
        } else if (json.found === false && json.message) {
          setConnectionStatus("online");
          addLog(`ℹ️ [SIN REGISTROS] ${json.message}`);
        } else if (json.error) {
          setConnectionStatus("warning");
          addLog(`❌ [ERROR REPORTADO] ${json.error}`);
        } else {
          addLog("Respuesta del servidor:");
          addLog(text.slice(0, 300));
        }
      } catch {
        addLog("❌ La respuesta no es JSON válido:");
        addLog(text.slice(0, 400));
      }
    } catch (netErr) {
      setConnectionStatus("offline");
      addLog("❌ Error de red al consultar la API: " + (netErr instanceof Error ? netErr.message : String(netErr)));
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="bg-[#121128] border border-indigo-500/20 rounded-2xl p-5 shadow-2xl space-y-4 mb-6">
      {/* CABECERA */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-xl shadow-[0_0_15px_rgba(99,102,241,0.3)]">
            🛡️
          </div>
          <div>
            <h3 className="text-sm font-black text-white tracking-wide uppercase flex items-center gap-2">
              Conexión Fiscalía &amp; Cloudflare
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                SIAF Online
              </span>
            </h3>
            <p className="text-[11px] text-white/50">
              Supervisión en vivo del servicio de consultas a Fiscalía del Ecuador.
            </p>
          </div>
        </div>

        {/* INDICADOR DE ESTADO EN VIVO */}
        <div className="flex items-center gap-2">
          {connectionStatus === "online" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.25)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>CONEXIÓN ACTIVA {latency ? `(${latency}ms)` : ""}</span>
            </div>
          )}

          {connectionStatus === "checking" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-spin border-2 border-indigo-400 border-t-transparent"></span>
              <span>Verificando conexión...</span>
            </div>
          )}

          {connectionStatus === "warning" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span>Conexión Inestable</span>
            </div>
          )}

          {connectionStatus === "offline" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
              <span>Sin Conexión</span>
            </div>
          )}
        </div>
      </div>

      {/* CONTROLES Y PRUEBA */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* ESTADO DEL SISTEMA */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
          <div>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                📡 Estado de la Red
              </h4>
              <span className="text-[11px] text-white/50 font-mono">{proxyMode}</span>
            </div>
            <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
              Las consultas se gestionan internamente para que todos los usuarios y pasantes consulten sin necesidad de instalar nada en sus navegadores.
            </p>
          </div>
          <button
            onClick={checkHealth}
            disabled={connectionStatus === "checking"}
            className="w-full py-2 px-3 rounded-lg bg-indigo-600/60 hover:bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            🔄 Comprobar Conexión Ahora
          </button>
        </div>

        {/* PRUEBA DE CONEXIÓN */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              🧪 Probar Consulta en Vivo
            </h4>
            <div className="flex gap-2 mt-2">
              <select
                value={testCriterio}
                onChange={(e) => setTestCriterio(e.target.value)}
                className="bg-black/30 border border-white/15 text-white text-xs rounded-lg px-2 py-1 outline-none"
              >
                <option value="6">N° Oficio</option>
                <option value="2">Cédula</option>
              </select>
              <input
                type="text"
                value={testValor}
                onChange={(e) => setTestValor(e.target.value)}
                placeholder="Número a probar..."
                className="flex-1 bg-black/30 border border-white/15 text-white text-xs rounded-lg px-3 py-1 outline-none font-mono"
              >
              </input>
            </div>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="w-full py-2 px-3 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isTesting ? (
              <span className="flex items-center gap-2 animate-pulse">Consultando...</span>
            ) : (
              <>
                <span>▶ Ejecutar Prueba y Ver Logs</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* VISOR DE LOGS */}
      <div className="bg-black/50 border border-white/10 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider font-mono">
              Consola de Logs
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLogs}
              disabled={logs.length === 0}
              className="text-[10px] text-white/60 hover:text-white px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 transition-all disabled:opacity-30 cursor-pointer"
            >
              Copiar Log
            </button>
            <button
              onClick={handleClearLogs}
              disabled={logs.length === 0}
              className="text-[10px] text-white/60 hover:text-red-400 px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 transition-all disabled:opacity-30 cursor-pointer"
            >
              Limpiar
            </button>
          </div>
        </div>

        <div className="h-32 overflow-y-auto font-mono text-[11px] space-y-1 custom-scrollbar pr-2 select-text">
          {logs.length === 0 ? (
            <p className="text-white/30 italic text-center py-8">
              No hay eventos registrados. Presiona &quot;Ejecutar Prueba y Ver Logs&quot; para inspeccionar la respuesta.
            </p>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className={`leading-relaxed whitespace-pre-wrap ${
                  log.includes("❌") || log.includes("ERROR") || log.includes("🔴")
                    ? "text-red-400 font-semibold"
                    : log.includes("✅") || log.includes("ÉXITO") || log.includes("🟢")
                    ? "text-emerald-400 font-semibold"
                    : log.includes("⚠️") || log.includes("DIAGNÓSTICO")
                    ? "text-amber-300"
                    : "text-white/80"
                }`}
              >
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
