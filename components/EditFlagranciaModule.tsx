"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";
import ConfirmModal from "./ConfirmModal";
import FormDelegacionesDiariasEdit from "./FormDelegacionesDiariasEdit";

type FlagranciaRow = Record<string, string | number | null> & { id?: number | string };

export default function EditFlagranciaModule() {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<FlagranciaRow[]>([]);
  const [editando, setEditando] = useState<FlagranciaRow | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<number | string | null>(null);
  const searchSeqRef = useRef(0);

  const _now = new Date();
  const HOY_ANIO = String(_now.getFullYear());
  const HOY_MES = String(_now.getMonth() + 1).padStart(2, "0");
  const HOY_DIA = String(_now.getDate()).padStart(2, "0");

  const [fcDefault, setFcDefault] = useState({ anio: HOY_ANIO, mes: HOY_MES, dia: HOY_DIA });
  const [extractoDefault, setExtractoDefault] = useState({ anio: HOY_ANIO, mes: HOY_MES, dia: "" });
  const [cumplirItem, setCumplirItem] = useState<FlagranciaRow | null>(null);
  const [isSavingCumplimiento, setIsSavingCumplimiento] = useState(false);
  const [cumplimientoForm, setCumplimientoForm] = useState({
    fcAnio: HOY_ANIO, fcMes: HOY_MES, fcDia: HOY_DIA,
    oficioDescargo: "",
    exAnio: HOY_ANIO, exMes: HOY_MES, exDia: "",
    fojas: "",
  });

  const buscarIfPaginado = async (txt: string, soloDigitos: string, seq: number): Promise<FlagranciaRow[]> => {
    const PAGE_SIZE = 1000;
    const MAX_PAGES = 25;
    const TARGET_MATCHES = 150;
    const encontrados = new Map<string, FlagranciaRow>();

    for (let page = 0; page < MAX_PAGES; page += 1) {
      if (seq !== searchSeqRef.current) return [];

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("FLAGRANCIA")
        .select("id, IF, DETENIDO, DELITO_DESAGREGACION_POLICIA_JUDICIAL, APELLIDOS_Y_NOMBRES_DEL_FISCAL, CUMPLIMIENTO_TOTAL, \"Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE\"")
        .order("id", { ascending: true })
        .range(from, to);

      if (error || !data || data.length === 0) {
        break;
      }

      for (const row of data as FlagranciaRow[]) {
        const ifText = String(row["IF"] || "");
        const matchTexto = ifText.toUpperCase().includes(txt.toUpperCase());
        const matchDigitos = soloDigitos.length >= 2 && ifText.replace(/\D/g, "").includes(soloDigitos);
        if (matchTexto || matchDigitos) {
          const key = String(row.id ?? row["IF"] ?? Math.random());
          encontrados.set(key, row);
        }
      }

      if (encontrados.size >= TARGET_MATCHES || data.length < PAGE_SIZE) {
        break;
      }
    }

    return Array.from(encontrados.values());
  };

  const abrirEdicion = async (item: FlagranciaRow) => {
    const id = item.id;
    if (id === undefined || id === null) {
      setNotification({ message: "No se puede editar: registro sin id", type: "error" });
      return;
    }

    const { data, error } = await supabase
      .from("FLAGRANCIA")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      setNotification({ message: `No se pudo cargar el registro: ${error?.message || "sin datos"}`, type: "error" });
      return;
    }

    setEditando(data as FlagranciaRow);
  };

  const handleSearch = async (valor: string) => {
    const seq = ++searchSeqRef.current;
    setBusqueda(valor);
    const txt = valor.trim();
    if (txt.length < 2) {
      if (seq !== searchSeqRef.current) return;
      setResultados([]);
      return;
    }

    const like = `%${txt}%`;
    const soloDigitos = txt.replace(/\D/g, "");

    const [porDetenido, porIf] = await Promise.all([
      supabase
        .from("FLAGRANCIA")
        .select("id, IF, DETENIDO, DELITO_DESAGREGACION_POLICIA_JUDICIAL, APELLIDOS_Y_NOMBRES_DEL_FISCAL, CUMPLIMIENTO_TOTAL, \"Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE\"")
        .ilike("DETENIDO", like)
        .order("id", { ascending: true })
        .limit(150),
      buscarIfPaginado(txt, soloDigitos, seq),
    ]);

    if (seq !== searchSeqRef.current) return;

    if (porDetenido.error) {
      setNotification({ message: `Error de busqueda: ${porDetenido.error.message || "Error desconocido"}`, type: "error" });
      setResultados([]);
      return;
    }

    const combinado = [
      ...((porDetenido.data || []) as FlagranciaRow[]),
      ...porIf,
    ];

    const mapById = new Map<string, FlagranciaRow>();
    combinado.forEach((item) => {
      const key = String(item.id ?? item["IF"] ?? Math.random());
      mapById.set(key, item);
    });

    const lista = Array.from(mapById.values())
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
      .slice(0, 200);
    setResultados(lista);
  };

  const requestEliminar = (id: number | string | undefined) => {
    if (id === undefined || id === null) {
      setNotification({ message: "No se puede eliminar: registro sin id", type: "error" });
      return;
    }
    setItemToDelete(id);
  };

  const splitFecha = (valor: string | number | null): { anio: string; mes: string; dia: string } => {
    const txt = String(valor || "").trim().replace(/\//g, "-");
    if (!txt || /^null$/i.test(txt)) return { anio: "", mes: "", dia: "" };
    const [a = "", m = "", d = ""] = txt.split("-");
    return { anio: a.slice(0, 4), mes: m.slice(0, 2), dia: d.slice(0, 2) };
  };

  const abrirCumplir = async (item: FlagranciaRow) => {
    const id = item.id;
    if (id === undefined || id === null) {
      setNotification({ message: "No se puede abrir: registro sin id", type: "error" });
      return;
    }

    const { data, error } = await supabase
      .from("FLAGRANCIA")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      setNotification({ message: `Error al cargar registro: ${error?.message || "sin datos"}`, type: "error" });
      return;
    }

    const registro = data as FlagranciaRow;
    const fc = splitFecha(registro.F_CUMPLIMIENTO);
    const ex = splitFecha(registro.EXTRACTO);
    const oficio = String(registro.OFICIO_DESCARGO || "").replace(/\D/g, "").slice(0, 5);
    const fojas = String(registro.FOJAS || "").replace(/\D/g, "").slice(0, 3);

    const yaHayCumplimiento = String(registro.CUMPLIMIENTO_TOTAL || "").toUpperCase() === "SI";

    if (yaHayCumplimiento) {
      setCumplimientoForm({
        fcAnio: fc.anio || fcDefault.anio,
        fcMes: fc.mes || fcDefault.mes,
        fcDia: fc.dia || fcDefault.dia,
        oficioDescargo: oficio,
        exAnio: ex.anio || extractoDefault.anio,
        exMes: ex.mes || extractoDefault.mes,
        exDia: ex.dia || extractoDefault.dia,
        fojas,
      });
    } else {
      setCumplimientoForm({
        fcAnio: fcDefault.anio,
        fcMes: fcDefault.mes,
        fcDia: fcDefault.dia,
        oficioDescargo: "",
        exAnio: extractoDefault.anio,
        exMes: extractoDefault.mes,
        exDia: extractoDefault.dia,
        fojas: "",
      });
    }
    setCumplirItem({ ...registro, _yaCumplida: yaHayCumplimiento ? "SI" : "NO" });
  };

  const guardarCumplimiento = async () => {
    if (!cumplirItem?.id) return;
    setIsSavingCumplimiento(true);

    const fcStr = `${cumplimientoForm.fcAnio}/${cumplimientoForm.fcMes}/${cumplimientoForm.fcDia || "01"}`;
    const exStr = `${cumplimientoForm.exAnio}/${cumplimientoForm.exMes}/${cumplimientoForm.exDia || "01"}`;
    const nInforme = cumplimientoForm.oficioDescargo ? `${cumplimientoForm.oficioDescargo}-UDF` : null;

    // Payload explícito con los nombres exactos de columna de la tabla FLAGRANCIA
    const payload: Record<string, unknown> = {
      N_ART: 2,
      QUE_ART_CUMPLIO_DENTRO_DEL_PLAZO: 2,
      CUMPLIMIENTO_PARCIAL: "NO",
      CUMPLIMIENTO_TOTAL: "SI",
      F_CUMPLIMIENTO: fcStr,
      OFICIO_DESCARGO: cumplimientoForm.oficioDescargo ? Number(cumplimientoForm.oficioDescargo) : null,
      RECONOCIMIENTOS: 1,
      INFORME_O_DESCARGO: "INFORME DE CUMPLIMIENTO",
      "FUENTE_DE_INFORMACIÓN": "FLAGRANCIA MODELO",
      FECHA_ORIGINAL_DEL_OFICIO: "INSTRUCCIÓN FISCAL",
      EXTRACTO: exStr,
      N_INFORME: nInforme,
      FOJAS: cumplimientoForm.fojas ? Number(cumplimientoForm.fojas) : null,
    };

    console.info("[Cumplimiento] Payload:", payload, "ID:", cumplirItem.id, "IF:", cumplirItem["IF"]);

    const ifValue = String(cumplirItem["IF"] || "");

    const { data: filas, error, status } = await supabase
      .from("FLAGRANCIA")
      .update(payload)
      .eq("id", Number(cumplirItem.id))
      .select("id");

    setIsSavingCumplimiento(false);

    if (error) {
      // Fallback: intentar por IF si falló por id
      if (ifValue) {
        const retry = await supabase
          .from("FLAGRANCIA")
          .update(payload)
          .eq("IF", ifValue)
          .select("id");
        if (!retry.error && retry.data && retry.data.length > 0) {
          setFcDefault({ anio: cumplimientoForm.fcAnio, mes: cumplimientoForm.fcMes, dia: cumplimientoForm.fcDia });
          setExtractoDefault({ anio: cumplimientoForm.exAnio, mes: cumplimientoForm.exMes, dia: cumplimientoForm.exDia });
          setNotification({ message: "Cumplimiento guardado en FLAGRANCIA", type: "success" });
          setCumplirItem(null);
          return;
        }
        console.error("[Cumplimiento] Error (retry por IF):", retry.error);
      }
      console.error("[Cumplimiento] Error al guardar:", { error, status, payload, id: cumplirItem.id });
      setNotification({ message: `Error al guardar: ${error.message} (HTTP ${status})`, type: "error" });
      return;
    }

    if (!filas || filas.length === 0) {
      console.warn("[Cumplimiento] Update no afectó ninguna fila. id=", cumplirItem.id, "IF=", ifValue);
      setNotification({ message: "No se actualizó ninguna fila. Verifica permisos RLS en Supabase.", type: "error" });
      return;
    }

    setFcDefault({ anio: cumplimientoForm.fcAnio, mes: cumplimientoForm.fcMes, dia: cumplimientoForm.fcDia });
    setExtractoDefault({ anio: cumplimientoForm.exAnio, mes: cumplimientoForm.exMes, dia: cumplimientoForm.exDia });
    setNotification({ message: "Cumplimiento guardado en FLAGRANCIA", type: "success" });
    setCumplirItem(null);
  };

  const confirmEliminar = async () => {
    if (!itemToDelete) return;
    const { data: filasBorradas, error } = await supabase
      .from("FLAGRANCIA")
      .delete()
      .eq("id", Number(itemToDelete))
      .select("id");
    if (error) {
      console.error("[Eliminar] Error:", error, "id:", itemToDelete);
      setNotification({ message: `Error al eliminar: ${error.message}`, type: "error" });
    } else if (!filasBorradas || filasBorradas.length === 0) {
      console.warn("[Eliminar] No se borró ninguna fila. id=", itemToDelete);
      setNotification({ message: "No se eliminó ningún registro. Verifica permisos RLS en Supabase.", type: "error" });
    } else {
      setNotification({ message: "Registro eliminado con exito", type: "success" });
      if (editando?.id === itemToDelete) {
        setEditando(null);
      }
      handleSearch(busqueda);
    }
    setItemToDelete(null);
  };

  return (
    <>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {itemToDelete && (
        <ConfirmModal
          title="Confirmar Eliminacion"
          message="Esta accion eliminara el registro de FLAGRANCIA permanentemente."
          onConfirm={confirmEliminar}
          onCancel={() => setItemToDelete(null)}
        />
      )}

      {editando ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => requestEliminar(editando.id)}
              className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-[10px] font-bold uppercase hover:bg-red-500/20"
            >
              Eliminar Registro
            </button>
          </div>
          <FormDelegacionesDiariasEdit
            mode="edit"
            editId={editando.id ?? null}
            initialRecord={editando}
            onCancelEdit={() => setEditando(null)}
            onSavedEdit={() => {
              setEditando(null);
              setNotification({ message: "Registro actualizado en FLAGRANCIA", type: "success" });
              handleSearch(busqueda);
            }}
          />
        </div>
      ) : (
        <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-4">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por DETENIDO o IF (parcial)..."
            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-indigo-500"
          />
          <div className="space-y-3">
            {resultados.map((item) => (
              <div key={String(item.id ?? item["IF"])} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 md:p-6 bg-white/5 rounded-2xl border border-white/5 hover:border-indigo-500/30 transition-colors">
                <div className="flex flex-col gap-2 overflow-hidden">
                  <span className="text-sm font-bold text-indigo-300 font-mono tracking-wide">{String(item["IF"] || "SIN IF")}</span>
                  <span className="text-sm font-semibold text-white">{String(item["DETENIDO"] || "—")}</span>
                  {item["DELITO_DESAGREGACION_POLICIA_JUDICIAL"] && (
                    <span className="text-xs text-amber-300/90">{String(item["DELITO_DESAGREGACION_POLICIA_JUDICIAL"])}</span>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {item["APELLIDOS_Y_NOMBRES_DEL_FISCAL"] && (
                      <span className="text-xs text-white/60">
                        <span className="text-white/30">Fiscal: </span>{String(item["APELLIDOS_Y_NOMBRES_DEL_FISCAL"])}
                      </span>
                    )}
                    {item["Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE"] && (
                      <span className="text-xs text-white/60 font-mono">
                        <span className="text-white/30">Oficio: </span>{String(item["Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE"])}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => void abrirEdicion(item)} className="px-4 py-2.5 bg-white/10 rounded-lg text-xs font-bold uppercase hover:bg-white/20 text-white">Editar</button>
                  <button
                    onClick={() => void abrirCumplir(item)}
                    className={`px-4 py-2.5 rounded-lg text-xs font-bold uppercase ${String(item["CUMPLIMIENTO_TOTAL"] || "").toUpperCase() === "SI" ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" : "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"}`}
                  >
                    {String(item["CUMPLIMIENTO_TOTAL"] || "").toUpperCase() === "SI" ? "Cumplido" : "No cumplido"}
                  </button>
                  <button onClick={() => requestEliminar(item.id)} className="px-4 py-2.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold uppercase hover:bg-red-500/20">Eliminar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {cumplirItem && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-neutral-950 shadow-2xl">

            <div className="p-4 border-b border-white/10">
              <h4 className="text-sm font-bold text-white uppercase">Registrar Cumplimiento</h4>
              <p className="text-[10px] text-white/50 mt-1 font-mono truncate">
                {String(cumplirItem["IF"] || "")} — {String(cumplirItem["DETENIDO"] || "")}
              </p>
              {cumplirItem["_yaCumplida"] === "SI" ? (
                <div className="mt-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase">Este registro ya tiene cumplimiento registrado. Puedes modificarlo.</span>
                </div>
              ) : (
                <div className="mt-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <span className="text-[10px] font-bold text-amber-300 uppercase">Este registro aun no tiene cumplimiento. Llena los datos para guardarlo.</span>
                </div>
              )}
            </div>

            <div className="p-4 space-y-4">

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">F. Cumplimiento</label>
                <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500">
                  <input
                    type="text" inputMode="numeric" maxLength={4}
                    value={cumplimientoForm.fcAnio}
                    onChange={(e) => setCumplimientoForm(p => ({ ...p, fcAnio: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="AAAA"
                    className="w-16 bg-white/10 border-r border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center focus:bg-white/20"
                  />
                  <input
                    type="text" inputMode="numeric" maxLength={2}
                    value={cumplimientoForm.fcMes}
                    onChange={(e) => setCumplimientoForm(p => ({ ...p, fcMes: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                    onBlur={(e) => { if (e.target.value.length === 1) setCumplimientoForm(p => ({ ...p, fcMes: e.target.value.padStart(2, "0") })); }}
                    placeholder="MM"
                    className="w-12 bg-neutral-900 border-x border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
                  />
                  <input
                    type="text" inputMode="numeric" maxLength={2}
                    value={cumplimientoForm.fcDia}
                    onChange={(e) => setCumplimientoForm(p => ({ ...p, fcDia: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                    onBlur={(e) => { if (e.target.value.length === 1) setCumplimientoForm(p => ({ ...p, fcDia: e.target.value.padStart(2, "0") })); }}
                    placeholder="DD"
                    className="w-12 bg-neutral-900 border-l border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase">Oficio Descargo</label>
                  <input
                    type="text" inputMode="numeric" maxLength={5}
                    value={cumplimientoForm.oficioDescargo}
                    onChange={(e) => setCumplimientoForm(p => ({ ...p, oficioDescargo: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                    placeholder="00000"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase">N. Informe</label>
                  <input
                    type="text" readOnly tabIndex={-1}
                    value={cumplimientoForm.oficioDescargo ? `${cumplimientoForm.oficioDescargo}-UDF` : ""}
                    placeholder="Auto"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white/60 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Extracto (Fecha)</label>
                <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500">
                  <input
                    type="text" inputMode="numeric" maxLength={4}
                    value={cumplimientoForm.exAnio}
                    onChange={(e) => setCumplimientoForm(p => ({ ...p, exAnio: e.target.value.replace(/\D/g, "").slice(0, 4) }))}
                    placeholder="AAAA"
                    className="w-16 bg-white/10 border-r border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center focus:bg-white/20"
                  />
                  <input
                    type="text" inputMode="numeric" maxLength={2}
                    value={cumplimientoForm.exMes}
                    onChange={(e) => setCumplimientoForm(p => ({ ...p, exMes: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                    onBlur={(e) => { if (e.target.value.length === 1) setCumplimientoForm(p => ({ ...p, exMes: e.target.value.padStart(2, "0") })); }}
                    placeholder="MM"
                    className="w-12 bg-neutral-900 border-x border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
                  />
                  <input
                    type="text" inputMode="numeric" maxLength={2}
                    value={cumplimientoForm.exDia}
                    onChange={(e) => setCumplimientoForm(p => ({ ...p, exDia: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                    onBlur={(e) => { if (e.target.value.length === 1) setCumplimientoForm(p => ({ ...p, exDia: e.target.value.padStart(2, "0") })); }}
                    placeholder="DD"
                    className="w-12 bg-neutral-900 border-l border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Fojas</label>
                <input
                  type="text" inputMode="numeric" maxLength={3}
                  value={cumplimientoForm.fojas}
                  onChange={(e) => setCumplimientoForm(p => ({ ...p, fojas: e.target.value.replace(/\D/g, "").slice(0, 3) }))}
                  placeholder="000"
                  className="w-24 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
                />
              </div>

            </div>

            <div className="p-4 border-t border-white/10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCumplirItem(null)}
                className="px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase bg-white/10 hover:bg-white/20 text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingCumplimiento}
                onClick={() => void guardarCumplimiento()}
                className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase ${isSavingCumplimiento ? "bg-white/20 text-white/50 cursor-wait" : "bg-emerald-600 hover:bg-emerald-500 text-white"}`}
              >
                {isSavingCumplimiento ? "Guardando..." : "Guardar Cumplimiento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
