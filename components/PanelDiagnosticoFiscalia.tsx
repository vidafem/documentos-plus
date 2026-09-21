"use client";

import React, { useState, useEffect } from "react";
import JSZip from "jszip";
import { isExtensionInstalled } from "@/lib/fiscaliaClient";

export default function PanelDiagnosticoFiscalia() {
  const [extensionActive, setExtensionActive] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [testValor, setTestValor] = useState("2026020206123363816");
  const [testCriterio, setTestCriterio] = useState("6"); // 6: Oficio, 2: Cédula
  const [logs, setLogs] = useState<string[]>([]);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    // Comprobar presencia inicial
    if (isExtensionInstalled()) {
      setExtensionActive(true);
    }

    // Escuchar si la extensión se activa dinámicamente
    const handleExtensionReady = () => {
      setExtensionActive(true);
      addLog("🟢 Conector de Navegador detectado y listo en este navegador.");
    };

    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "FISCALIA_CONNECTOR_AVAILABLE") {
        handleExtensionReady();
      }
    };
    window.addEventListener("message", handleMessage);

    // Polling ligero durante los primeros 5 segundos para detectar inyección retardada
    const checkInterval = setInterval(() => {
      if (isExtensionInstalled()) {
        setExtensionActive(true);
        clearInterval(checkInterval);
      }
    }, 600);

    // Enviar ping si ya estaba cargada
    const id = "ping_" + Math.random().toString(36).substring(2, 8);
    const handlePong = () => {
      setExtensionActive(true);
      window.removeEventListener("FISCALIA_EXTENSION_PONG_" + id, handlePong);
    };
    window.addEventListener("FISCALIA_EXTENSION_PONG_" + id, handlePong);
    window.dispatchEvent(new CustomEvent("FISCALIA_EXTENSION_PING", { detail: { id } }));

    return () => {
      clearInterval(checkInterval);
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("FISCALIA_EXTENSION_PONG_" + id, handlePong);
    };
  }, []);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev]);
  };

  const handleClearLogs = () => setLogs([]);

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    alert("¡Logs copiados al portapapeles!");
  };

  // Descarga automática del Conector en formato ZIP
  const handleDownloadExtension = async () => {
    setIsDownloading(true);
    addLog("Generando paquete ZIP del Conector de Navegador...");
    try {
      const zip = new JSZip();

      // Cargar archivos desde /conector-extension
      const [manifestRes, bgRes, contentRes, readmeRes] = await Promise.all([
        fetch("/conector-extension/manifest.json"),
        fetch("/conector-extension/background.js"),
        fetch("/conector-extension/content.js"),
        fetch("/conector-extension/INSTRUCCIONES.txt"),
      ]);

      zip.file("manifest.json", await manifestRes.text());
      zip.file("background.js", await bgRes.text());
      zip.file("content.js", await contentRes.text());
      zip.file("INSTRUCCIONES.txt", await readmeRes.text());

      const blob = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Conector-Fiscalia.zip";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      addLog("✅ Conector-Fiscalia.zip descargado con éxito. Sigue los 3 pasos para instalarlo.");
      setShowInstructions(true);
    } catch (err) {
      addLog("❌ Error descargando el conector: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDownloading(false);
    }
  };

  // Ejecución de prueba con diagnóstico profundo y logs
  const handleTestConnection = async () => {
    if (!testValor.trim()) {
      alert("Ingresa un número para probar.");
      return;
    }

    setIsTesting(true);
    addLog(`Iniciando prueba de conexión con Fiscalía (Criterio: ${testCriterio === "6" ? "Oficio" : "Cédula"}, Valor: ${testValor})...`);

    // 1. Probar vía Conector de Navegador si está activo
    if (isExtensionInstalled()) {
      addLog("➡️ Detectado Conector de Navegador. Enviando solicitud local...");
      const id = "test_" + Math.random().toString(36).substring(2, 9);

      const responsePromise = new Promise<{ success: boolean; data?: unknown; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          window.removeEventListener("FISCALIA_EXTENSION_RESPONSE_" + id, listener);
          resolve({ success: false, error: "Tiempo de espera agotado en la extensión (8s)" });
        }, 8000);

        const listener = (event: Event) => {
          clearTimeout(timeout);
          window.removeEventListener("FISCALIA_EXTENSION_RESPONSE_" + id, listener);
          const customEvent = event as CustomEvent<{ success: boolean; data?: unknown; error?: string }>;
          resolve(customEvent.detail || { success: false, error: "Sin datos" });
        };

        window.addEventListener("FISCALIA_EXTENSION_RESPONSE_" + id, listener);
        window.dispatchEvent(
          new CustomEvent("FISCALIA_EXTENSION_REQUEST", {
            detail: { id, criterio: testCriterio, valor: testValor },
          })
        );
      });

      const extResult = await responsePromise;
      if (extResult.success && extResult.data) {
        addLog("✅ [ÉXITO VÍA CONECTOR] La Fiscalía respondió con éxito:");
        addLog(JSON.stringify(extResult.data, null, 2).slice(0, 400) + "...");
        setIsTesting(false);
        return;
      } else {
        addLog(`⚠️ Conector devolvió error: ${extResult.error || "Desconocido"}. Probando servidor en la nube...`);
      }
    } else {
      addLog("ℹ️ Conector de navegador NO instalado. Probando a través de Cloudflare / Vercel...");
    }

    // 2. Probar vía API del servidor (Cloudflare / Vercel) con modo debug
    try {
      const endpoint = `/api/consulta-fiscalia?criterio=${testCriterio}&valor=${encodeURIComponent(testValor)}`;
      addLog(`🌐 GET ${endpoint}`);

      const res = await fetch(endpoint);
      const text = await res.text();
      addLog(`HTTP Status: ${res.status}`);

      try {
        const json = JSON.parse(text);
        if (json.success && json.found) {
          addLog("✅ [ÉXITO EN LA NUBE] Registro encontrado:");
          addLog(`   Delito: ${json.delito}`);
          addLog(`   Detenido(s): ${json.detenidos}`);
          addLog(`   NDD: ${json.ndd}`);
        } else if (json.found === false && json.message) {
          addLog(`ℹ️ [SIN REGISTROS] ${json.message}`);
        } else if (json.error) {
          addLog(`❌ [ERROR REPORTADO] ${json.error}`);
          if (json.error.includes("403") || json.error.includes("WAF")) {
            addLog("💡 DIAGNÓSTICO: El cortafuegos de Fiscalía (Imperva WAF) bloquea las IPs de los servidores de Vercel/Cloudflare.");
            addLog("👉 SOLUCIÓN: Descarga e instala el Conector de Navegador (botón arriba) para consultar directo desde tu PC.");
          }
        } else {
          addLog("Respuesta cruda del servidor:");
          addLog(text.slice(0, 300));
        }
      } catch {
        addLog("❌ La respuesta no es JSON válido. Contenido recibido:");
        addLog(text.slice(0, 400));
      }
    } catch (netErr) {
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
              Conexión y Diagnóstico de Fiscalía
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                SIAF Online
              </span>
            </h3>
            <p className="text-[11px] text-white/50">
              Supervisión de consultas, estado de Cloudflare y conector directo sin servidores.
            </p>
          </div>
        </div>

        {/* INDICADOR DE ESTADO EN VIVO */}
        <div className="flex items-center gap-2">
          {extensionActive ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.25)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>Conector de Navegador: ACTIVO</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse"></span>
              <span>Conector: No detectado en este navegador</span>
            </div>
          )}
        </div>
      </div>

      {/* BOTONES DE ACCIÓN */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* BOTÓN DESCARGAR CONECTOR */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              🔌 Conector para Chrome / Edge (Sin Servidores)
            </h4>
            <p className="text-[11px] text-white/50 mt-1 leading-relaxed">
              Permite que tu navegador consulte a Fiscalía desde tu conexión en Ecuador con peticiones ilimitadas y 0 bloqueos de WAF, sin depender de máquinas encendidas.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadExtension}
              disabled={isDownloading}
              className="flex-1 py-2 px-3 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              {isDownloading ? (
                <span>Descargando...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Descargar Conector (.ZIP)</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white text-xs font-bold transition-all"
              title="Ver instrucciones de instalación"
            >
              {showInstructions ? "Ocultar Guía" : "¿Cómo instalar?"}
            </button>
          </div>
        </div>

        {/* PRUEBA DE CONEXIÓN */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
          <div>
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              🧪 Prueba de Conexión en Vivo
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
              />
            </div>
          </div>
          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="w-full py-2 px-3 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          >
            {isTesting ? (
              <span className="flex items-center gap-2 animate-pulse">Probando conexión...</span>
            ) : (
              <>
                <span>▶ Ejecutar Prueba y Ver Logs</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* GUÍA DE INSTALACIÓN EXPANDIBLE */}
      {showInstructions && (
        <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/30 rounded-xl p-4 text-xs text-white/80 space-y-2 animate-fadeIn">
          <h5 className="font-bold text-indigo-300 text-sm flex items-center gap-2">
            📋 Cómo instalar el conector en 3 pasos sencillos:
          </h5>
          <ol className="list-decimal list-inside space-y-1.5 pl-1 text-[11px] leading-relaxed">
            <li>
              <strong>Descomprime</strong> el archivo <code className="bg-white/10 px-1 py-0.5 rounded text-amber-300">Conector-Fiscalia.zip</code> en cualquier carpeta de tu computadora.
            </li>
            <li>
              Abre tu navegador (Chrome o Edge) e ingresa en la barra de direcciones:
              <code className="bg-white/10 px-1.5 py-0.5 rounded text-cyan-300 ml-1">chrome://extensions</code> (o <code className="bg-white/10 px-1.5 py-0.5 rounded text-cyan-300">edge://extensions</code>).
            </li>
            <li>
              Activa la casilla <strong>&quot;Modo de desarrollador&quot;</strong> (arriba a la derecha), haz clic en el botón <strong>&quot;Cargar descomprimida&quot;</strong> y selecciona la carpeta descomprimida.
            </li>
          </ol>
          <p className="text-[10px] text-white/40 italic pt-1">
            Una vez hecho, recarga esta página y el indicador cambiará a &quot;ACTIVO&quot;. Todas las consultas pasarán por tu navegador directamente.
          </p>
        </div>
      )}

      {/* VISOR DE LOGS */}
      <div className="bg-black/50 border border-white/10 rounded-xl p-3.5 space-y-2">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span>
            <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider font-mono">
              Consola de Logs en Tiempo Real
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

        <div className="h-36 overflow-y-auto font-mono text-[11px] space-y-1 custom-scrollbar pr-2 select-text">
          {logs.length === 0 ? (
            <p className="text-white/30 italic text-center py-10">
              No hay eventos registrados. Presiona &quot;Ejecutar Prueba y Ver Logs&quot; para inspeccionar la conexión con Fiscalía.
            </p>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className={`leading-relaxed whitespace-pre-wrap ${
                  log.includes("❌") || log.includes("ERROR")
                    ? "text-red-400 font-semibold"
                    : log.includes("✅") || log.includes("ÉXITO")
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
