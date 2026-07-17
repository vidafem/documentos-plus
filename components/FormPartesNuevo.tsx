"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

const normalizeYearInput = (value: string) => value.replace(/\D/g, "").slice(0, 4);
const normalizeUpper = (value: string) => value.toUpperCase();
const formatExpediente = (sequence: number, year: string) => `${String(sequence).padStart(4, "0")}-${year}`;

const getSequenceFromExpediente = (expediente: string, year: string): number => {
  const match = expediente.trim().match(/^(\d{1,})-(\d{4})$/);
  if (!match) return 0;
  if (match[2] !== year) return 0;
  const sequence = Number(match[1]);
  return Number.isFinite(sequence) ? sequence : 0;
};

const normalizeDetenidosForSave = (value: string): string =>
  normalizeUpper(value)
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

export default function FormPartesNuevo() {
  const COL_DELITO_CANDIDATAS = [
    "DELITO_TIPIFICADO_EN_DELEGACION",
    "delito_tipificado_en_delegacion",
  ];

  // --- ESTADOS DE CONTROL DE UI ---
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // --- ESTADOS PERSISTENTES (Sticky) ---
  const [anio, setAnio] = useState("2021");
  const [mesProceso, setMesProceso] = useState("01");
  const [diaApertura, setDiaApertura] = useState("01");
  const [diaCierre, setDiaCierre] = useState("01");

  // --- ESTADOS VARIABLES ---
  const [nExpediente, setNExpediente] = useState<number>(1);
  const [ppUltimos10, setPpUltimos10] = useState("");
  const [detenidos, setDetenidos] = useState("");
  const [delito, setDelito] = useState("");
  const [fojas, setFojas] = useState("");
  const [sugerencias, setSugerencias] = useState<{ delito: string }[]>([]);

  const obtenerSiguienteExpedientePorAnio = async (anioSeleccionado: string) => {
    if (anioSeleccionado.length !== 4) {
      setNExpediente(1);
      return;
    }

    const { data, error } = await supabase
      .from("PARTES")
      .select("expediente")
      .like("expediente", `%-${anioSeleccionado}`)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      setNExpediente(1);
      return;
    }

    const maxSequence = (data || []).reduce((acc, row) => {
      const value = String(row.expediente || "");
      const seq = getSequenceFromExpediente(value, anioSeleccionado);
      return seq > acc ? seq : acc;
    }, 0);

    setNExpediente(maxSequence + 1);
  };

  useEffect(() => {
    let active = true;

    const cargar = async () => {
      const anioNormalizado = normalizeYearInput(anio);
      if (!active) return;
      await obtenerSiguienteExpedientePorAnio(anioNormalizado);
    };

    void cargar();

    return () => {
      active = false;
    };
  }, [anio]);

  // 2. BUSCADOR DE DELITOS
  const buscarDelitos = async (texto: string) => {
    const textoUpper = normalizeUpper(texto);
    setDelito(textoUpper);
    if (textoUpper.length < 3) {
      setSugerencias([]);
      return;
    }
    for (const col of COL_DELITO_CANDIDATAS) {
      const { data, error } = await supabase
        .from("delitos")
        .select(col)
        .ilike(col, `%${textoUpper}%`)
        .limit(5);

      if (error) {
        continue;
      }

      const filas = (data || []) as unknown[];
      const normalizadas = filas
        .map((row) => {
          const registro = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          return { delito: normalizeUpper(String(registro[col] || "")) };
        })
        .filter((row) => row.delito.trim().length > 0);

      setSugerencias(normalizadas);
      return;
    }

    console.error("Error en búsqueda de delitos: no se pudo consultar DELITO_TIPIFICADO_EN_DELEGACION");
    setSugerencias([]);
  };

  const handleDetenidosKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey) return;

    const textarea = e.currentTarget;
    const start = textarea.selectionStart ?? detenidos.length;
    const end = textarea.selectionEnd ?? detenidos.length;
    const beforeCaret = detenidos.slice(0, start);
    const currentChunk = beforeCaret.split(",").pop() || "";
    const words = currentChunk.trim().split(/\s+/).filter(Boolean);

    if (words.length < 4) return;
    if (beforeCaret.endsWith(" ") || beforeCaret.endsWith(",")) return;

    e.preventDefault();
    const updated = `${detenidos.slice(0, start)}, ${detenidos.slice(end)}`;
    setDetenidos(normalizeUpper(updated));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const anioRegistro = normalizeYearInput(anio);
    if (anioRegistro.length !== 4) {
      setIsLoading(false);
      setNotification({ message: "El año debe tener 4 dígitos.", type: "error" });
      return;
    }

    const expedienteFormateado = formatExpediente(nExpediente, anioRegistro);
    const codigoPPFull = `PP-${anioRegistro}${mesProceso}${diaCierre.padStart(2, "0")}${ppUltimos10}`;
    const detenidosNormalizados = normalizeDetenidosForSave(detenidos);
    const delitoNormalizado = normalizeUpper(delito).trim();
    const descFinal = `${codigoPPFull}; DETENIDO(S): ${detenidosNormalizados}; DELITO: ${delitoNormalizado}`;

    const registro = {
      expediente: expedienteFormateado,
      n_tomo: "1",
      descripcion: descFinal,
      fecha_apertura: `${anioRegistro}-${mesProceso}-${diaApertura.padStart(2, "0")}`,
      fecha_cierre: `${anioRegistro}-${mesProceso}-${diaCierre.padStart(2, "0")}`,
      n_fojas: fojas.substring(0, 3),
      destino_final: "ELIMINACIÓN",
      soporte: "FISICO",
      serie: "PROCEDIMIENTOS INVESTIGATIVOS",
    };

    const { error } = await supabase.from("PARTES").insert([registro]);

    setIsLoading(false);
    if (error) {
      setNotification({ message: "Error al guardar el registro", type: "error" });
    } else {
      setNotification({ message: "Registro Guardado", type: "success" });
      setNExpediente((prev) => prev + 1);
      setPpUltimos10("");
      setDetenidos("");
      setDelito("");
      setFojas("");
    }
  };

  const dias = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

  return (
    <>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="bg-white/5 rounded-[1.5rem] p-4 border border-white/5 space-y-3 animate-in fade-in duration-500 max-w-4xl mx-auto shadow-2xl">
        {/* HEADER ULTRA COMPACTO */}
        <div className="flex justify-between items-center border-b border-white/5 pb-2">
          <h2 className="text-sm font-black text-indigo-400 italic uppercase">Partes Policiales</h2>
          <div className="bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20 flex items-center gap-2">
            <span className="text-[8px] text-indigo-300 font-bold uppercase">Exp. Actual:</span>
            <span className="text-sm font-mono text-white leading-none">{String(nExpediente).padStart(4, "0")}</span>
            <span className="text-[8px] text-indigo-200/80 font-bold">({anio || "----"})</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* FILA 1: TODA LA CRONOLOGÍA */}
          <div className="grid grid-cols-4 gap-2 bg-black/60 p-2 rounded-xl border border-white/5">
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-white/30 uppercase">Año</label>
              <input type="text" maxLength={4} value={anio} onChange={(e) => setAnio(normalizeYearInput(e.target.value))} className="w-full bg-white/5 border border-white/10 rounded-lg py-1 text-xs text-center text-white font-bold outline-none focus:border-indigo-500" />
            </div>
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-white/30 uppercase">Mes</label>
              <select value={mesProceso} onChange={(e) => setMesProceso(e.target.value)} className="w-full bg-neutral-900 text-white border border-white/10 rounded-lg py-1 text-xs outline-none">
                {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => <option key={m} value={m} className="bg-neutral-900 text-white">{m}</option>)}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-indigo-400 uppercase">Día Apert.</label>
              <select value={diaApertura} onChange={(e) => setDiaApertura(e.target.value)} className="w-full bg-neutral-900 text-white border border-white/10 rounded-lg py-1 text-xs outline-none">
                {dias.map((d) => <option key={d} value={d} className="bg-neutral-900 text-white">{d}</option>)}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-indigo-400 uppercase">Día Cierre</label>
              <select value={diaCierre} onChange={(e) => setDiaCierre(e.target.value)} className="w-full bg-neutral-900 text-white border border-white/10 rounded-lg py-1 text-xs outline-none">
                {dias.map((d) => <option key={d} value={d} className="bg-neutral-900 text-white">{d}</option>)}
              </select>
            </div>
          </div>

          {/* FILA 2: CÓDIGO PP (ACTUALIZADO A 12 DÍGITOS) */}
          <div className="space-y-0.5">
            <label className="text-[8px] font-bold text-white/30 uppercase">Código PP (12 dígitos finales)</label>
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500 h-9">
              <span className="bg-white/10 px-3 h-full flex items-center text-[10px] font-mono text-white/40">
                PP-{anio}{mesProceso}{diaCierre.padStart(2, "0")}
              </span>
              <input required type="text" maxLength={12} value={ppUltimos10} onChange={(e) => setPpUltimos10(e.target.value)} className="flex-1 bg-transparent px-3 text-sm text-white outline-none font-bold" placeholder="000000000000" />
            </div>
          </div>

          {/* FILA 3: DETENIDOS */}
          <div className="space-y-0.5">
            <label className="text-[8px] font-bold text-white/30 uppercase">Detenidos</label>
            <textarea required value={detenidos} onChange={(e) => setDetenidos(normalizeUpper(e.target.value))} onKeyDown={handleDetenidosKeyDown} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 h-14 resize-none custom-scrollbar" placeholder="NOMBRES DE LOS DETENIDOS..." />
          </div>

          {/* FILA 4: DELITO + FOJAS */}
          <div className="flex gap-3 relative">
            <div className="flex-[3] space-y-0.5 relative">
              <label className="text-[8px] font-bold text-white/30 uppercase">Delito</label>
              <input required type="text" value={delito} onChange={(e) => buscarDelitos(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" placeholder="Buscar delito..." />
              {sugerencias.length > 0 && (
                <ul className="absolute z-50 w-full bg-neutral-950 border border-white/10 rounded-xl mt-1 shadow-2xl max-h-32 overflow-y-auto custom-scrollbar">
                  {sugerencias.map((s, i) => (
                    <li key={i} onClick={() => { setDelito(normalizeUpper(s.delito)); setSugerencias([]); }} className="p-2 text-[10px] text-white hover:bg-indigo-600 cursor-pointer border-b border-white/5 last:border-none uppercase transition-colors">
                      {s.delito}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex-1 space-y-0.5">
              <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
              <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500" placeholder="0" />
            </div>
          </div>

          {/* BOTÓN FINAL CON ESTADOS DINÁMICOS */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className={`px-12 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-2xl transition-all active:scale-95 tracking-tighter flex items-center gap-2
                ${isLoading ? "bg-white/20 text-white/50 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500 text-white"}
              `}
            >
              {isLoading ? "Procesando..." : "Guardar Registro"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
