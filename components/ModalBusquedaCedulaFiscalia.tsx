"use client";

import React, { useState, useEffect } from "react";
import { consultarFiscaliaConFallback } from "@/lib/fiscaliaClient";

export interface FiscaliaRecordItem {
  ndd: string;
  fecha: string;
  hora?: string;
  delito: string;
  detenidos: string;
  procesadosCount: number;
  sujetos?: Array<{ cedula?: string; persona?: string; tipo?: string }>;
}

interface ModalBusquedaCedulaFiscaliaProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecord: (record: FiscaliaRecordItem, applyDate: boolean) => void;
}

export default function ModalBusquedaCedulaFiscalia({
  isOpen,
  onClose,
  onSelectRecord,
}: ModalBusquedaCedulaFiscaliaProps) {
  const [cedulaInput, setCedulaInput] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [records, setRecords] = useState<FiscaliaRecordItem[]>([]);
  const [applyDateMap, setApplyDateMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!isOpen) {
      setCedulaInput("");
      setIsSearching(false);
      setHasSearched(false);
      setErrorMessage(null);
      setRecords([]);
      setApplyDateMap({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanValue = cedulaInput.replace(/\D/g, "").trim();

    if (cleanValue.length !== 10 && cleanValue.length !== 13) {
      setErrorMessage("La cédula debe tener 10 dígitos (o RUC de 13 dígitos).");
      return;
    }

    setErrorMessage(null);
    setIsSearching(true);
    setHasSearched(true);
    setRecords([]);
    setApplyDateMap({});

    try {
      const criterio = cleanValue.length === 13 ? 3 : 2;
      const res = await consultarFiscaliaConFallback(`criterio=${criterio}&valor=${encodeURIComponent(cleanValue)}`);

      if (res && res.success && res.found) {
        const foundRecords: FiscaliaRecordItem[] = Array.isArray(res.records) && res.records.length > 0
          ? res.records
          : [
              {
                ndd: res.ndd || "",
                fecha: res.fecha || "",
                hora: res.hora || "",
                delito: res.delito || "",
                detenidos: res.detenidos || "",
                procesadosCount: res.procesadosCount || 1,
              },
            ];

        setRecords(foundRecords);
        // Por defecto activar applyDate = true para todos
        const initialMap: Record<number, boolean> = {};
        foundRecords.forEach((_, idx) => {
          initialMap[idx] = true;
        });
        setApplyDateMap(initialMap);
      } else {
        setErrorMessage(
          res?.message || "No se encontraron denuncias ni causas para esta cédula en el sistema de la Fiscalía."
        );
      }
    } catch (err) {
      console.error("Error buscando por cédula en Fiscalía:", err);
      setErrorMessage("Error de conexión al consultar el servidor de Fiscalía.");
    } finally {
      setIsSearching(false);
    }
  };

  const formatDisplayDate = (fechaStr: string) => {
    if (!fechaStr) return "";
    if (fechaStr.includes("-")) {
      const p = fechaStr.split("-");
      if (p.length === 3 && p[0].length === 4) {
        return `${p[2]}/${p[1]}/${p[0]}`; // DD/MM/YYYY
      }
    }
    return fechaStr;
  };

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-3xl bg-neutral-950 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-inner">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 21h7a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v11m0 5l4.879-4.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>Búsqueda en Fiscalía por Cédula / RUC</span>
                <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-mono lowercase">
                  siaf online
                </span>
              </h3>
              <p className="text-[11px] text-white/50">
                Visualiza las fechas de todas las delegaciones encontradas y selecciona la que coincide con tu documento
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* BARRA DE BÚSQUEDA */}
        <form onSubmit={handleSearch} className="p-4 border-b border-white/10 bg-black/40">
          <label className="block text-[10px] font-bold text-white/40 uppercase mb-1.5">
            Cédula de Identidad (10 dígitos) o RUC (13 dígitos)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              maxLength={13}
              value={cedulaInput}
              onChange={(e) => setCedulaInput(e.target.value.replace(/\D/g, "").slice(0, 13))}
              placeholder="Ingresa los 10 dígitos de la cédula (ej. 0931658660)..."
              className="flex-1 bg-white/5 border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white font-mono outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-white/20"
            />
            <button
              type="submit"
              disabled={isSearching || cedulaInput.length < 10}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              {isSearching ? (
                <>
                  <svg className="w-4 h-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                  </svg>
                  <span>Buscando...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span>Consultar</span>
                </>
              )}
            </button>
          </div>
          {errorMessage && (
            <p className="text-[11px] text-red-400 mt-2 font-medium flex items-center gap-1.5 animate-in fade-in duration-150">
              <span>⚠</span> {errorMessage}
            </p>
          )}
        </form>

        {/* LISTA DE DELEGACIONES / CAUSAS */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar min-h-[260px]">
          {isSearching && (
            <div className="py-14 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-10 h-10 rounded-full border-3 border-indigo-500 border-t-transparent animate-spin" />
              <div>
                <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider animate-pulse">
                  Consultando base de datos de Fiscalía...
                </p>
                <p className="text-[11px] text-white/40 mt-1">
                  Obteniendo todas las noticias del delito, delegaciones y fechas registradas
                </p>
              </div>
            </div>
          )}

          {!isSearching && hasSearched && records.length === 0 && !errorMessage && (
            <div className="py-14 text-center text-white/40 text-xs">
              No se encontraron registros en Fiscalía para esta cédula.
            </div>
          )}

          {!isSearching && !hasSearched && (
            <div className="py-14 text-center text-white/30 text-xs space-y-2 max-w-md mx-auto">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 text-xl">
                📋
              </div>
              <p className="font-semibold text-white/50 text-sm">Ingresa el número de cédula del procesado o involucrado</p>
              <p className="text-[11px] text-white/40">
                Se desplegarán todas las delegaciones y noticias de delito con sus fechas de registro para que escojas la que corresponde a tu parte y se autorellene.
              </p>
            </div>
          )}

          {!isSearching &&
            records.map((rec, idx) => {
              const applyDate = applyDateMap[idx] ?? true;
              const formattedDate = formatDisplayDate(rec.fecha);

              return (
                <div
                  key={idx}
                  className="group p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-indigo-500/50 transition-all flex flex-col gap-3"
                >
                  {/* BARRA SUPERIOR: FECHA Y NDD */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {rec.fecha && (
                        <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono font-bold shadow-sm">
                          <span>📅</span>
                          <span>FECHA: {formattedDate}</span>
                          {rec.hora && <span className="text-amber-400/70 font-normal">({rec.hora})</span>}
                        </div>
                      )}
                      {rec.ndd && (
                        <span className="px-2.5 py-1 rounded-lg bg-white/5 text-white/80 border border-white/10 text-[11px] font-mono">
                          NDD: {rec.ndd}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        onSelectRecord(rec, applyDate);
                        onClose();
                      }}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400/40 text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/30 hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Seleccionar y Rellenar</span>
                      <span>→</span>
                    </button>
                  </div>

                  {/* DELITO */}
                  <div>
                    <label className="text-[9px] font-bold text-white/40 uppercase block mb-0.5">
                      Delito / Tipificación Penal
                    </label>
                    <div className="inline-block px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 text-xs font-bold uppercase tracking-wide">
                      ⚖ {rec.delito || "SIN TIPIFICACIÓN ESPECÍFICA"}
                    </div>
                  </div>

                  {/* SUJETOS / INVOLUCRADOS */}
                  <div>
                    <label className="text-[9px] font-bold text-white/40 uppercase block mb-1">
                      Involucrados / Sujetos Procesales
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.isArray(rec.sujetos) && rec.sujetos.length > 0 ? (
                        rec.sujetos
                          .filter((s) => String(s.persona || "").trim().length > 0)
                          .map((s, sIdx) => {
                            const tipo = String(s.tipo || "").trim().toUpperCase();
                            const isProcesado =
                              tipo === "PROCESADO" ||
                              tipo === "SOSPECHOSO" ||
                              tipo === "APREHENDIDO" ||
                              tipo === "DETENIDO";

                            return (
                              <span
                                key={sIdx}
                                className={`px-2.5 py-1 rounded-md text-[10px] font-mono flex items-center gap-1.5 border ${
                                  isProcesado
                                    ? "bg-rose-500/15 border-rose-500/30 text-rose-200 font-bold"
                                    : "bg-white/5 border-white/10 text-white/70"
                                }`}
                              >
                                <span className={`text-[8px] px-1 py-0.2 rounded font-sans uppercase font-bold ${
                                  isProcesado ? "bg-rose-500/30 text-rose-300" : "bg-white/10 text-white/60"
                                }`}>
                                  {tipo || "INVOLUCRADO"}
                                </span>
                                <span>{String(s.persona || "").trim()}</span>
                                {s.cedula && <span className="text-white/40 text-[9px]">({s.cedula})</span>}
                              </span>
                            );
                          })
                      ) : (
                        <p className="text-xs text-white/70 font-mono">
                          {rec.detenidos || "Sin información de sujetos"}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* OPCIÓN PARA APLICAR FECHA */}
                  {rec.fecha && (
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px]">
                      <label className="flex items-center gap-2 text-white/70 hover:text-white cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={applyDate}
                          onChange={(e) =>
                            setApplyDateMap((prev) => ({
                              ...prev,
                              [idx]: e.target.checked,
                            }))
                          }
                          className="rounded border-white/20 bg-white/5 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>
                          Aplicar también la fecha <strong className="text-amber-300 font-mono">({formattedDate})</strong> al formulario (Año, Mes y Día)
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-white/50">
          <span>
            {records.length > 0
              ? `Mostrando ${records.length} delegación(es) encontrada(s)`
              : "Búsqueda en tiempo real conectada a Fiscalía"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors cursor-pointer text-xs font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
