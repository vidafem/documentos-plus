"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import jsPDF from "jspdf";
import Notification from "./Notification";
import ConfirmModal from "./ConfirmModal";

type ParteRow = {
  id: string | number;
  expediente?: string;
  descripcion?: string;
  n_caja?: string;
  n_tomo?: string;
  fecha_apertura?: string;
  fecha_cierre?: string;
  n_fojas?: string | number;
  destino_final?: string;
};

type EditPartesProps = {
  sourceTable?: "PARTES" | "partes_viejas";
};

const normalizeYearInput = (value: string) => value.replace(/\D/g, "").slice(0, 4);
const normalizeUpper = (value: string) => value.toUpperCase();
const normalizeDetenidosForSave = (value: string): string =>
  normalizeUpper(value)
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();

const parseIsoDateParts = (value?: string) => {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { year: "", month: "", day: "" };
  return { year: match[1], month: match[2], day: match[3] };
};

const parseDescripcionParts = (descripcion?: string) => {
  const text = String(descripcion || "").trim();
  const matchPP = text.match(/^PP-(\d{4})(\d{2})(\d{2})(\d+)/i) || text.match(/^PP-(\d+)/i);
  let ppUltimos = "";
  if (matchPP) {
    if (matchPP[4]) {
      ppUltimos = matchPP[4];
    } else if (matchPP[1] && matchPP[1].length > 8) {
      ppUltimos = matchPP[1].slice(8);
    } else if (matchPP[1]) {
      ppUltimos = matchPP[1];
    }
  }

  const matchDetenidos = text.match(/DETENIDO\(S\):\s*([^;]+)(?:;|$)/i) || text.match(/DETENIDOS:\s*([^;]+)(?:;|$)/i);
  const matchDelito = text.match(/DELITO:\s*(.+)$/i);

  return {
    ppUltimos,
    detenidos: matchDetenidos ? matchDetenidos[1].trim() : "",
    delito: matchDelito ? matchDelito[1].trim() : "",
  };
};

export default function EditPartes({ sourceTable = "PARTES" }: EditPartesProps) {
  const COL_DELITO_CANDIDATAS = [
    "DELITO_TIPIFICADO_EN_DELEGACION",
    "delito_tipificado_en_delegacion",
  ];

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ParteRow[]>([]);
  const [editando, setEditando] = useState<ParteRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | number | null>(null);

  // Estados desglosados del registro en edición
  const [anio, setAnio] = useState("2021");
  const [mesProceso, setMesProceso] = useState("01");
  const [diaApertura, setDiaApertura] = useState("01");
  const [diaCierre, setDiaCierre] = useState("01");
  const [ppUltimos10, setPpUltimos10] = useState("");
  const [detenidos, setDetenidos] = useState("");
  const [delito, setDelito] = useState("");
  const [fojas, setFojas] = useState("");
  const [nTomo, setNTomo] = useState("1");
  const [nCaja, setNCaja] = useState("");
  const [sugerencias, setSugerencias] = useState<{ delito: string }[]>([]);

  const handleSearch = async (valor: string) => {
    setBusqueda(valor);
    if (valor.length < 3) return setResultados([]);
    const { data } = await supabase
      .from(sourceTable)
      .select("*")
      .or(`expediente.ilike.%${valor}%,descripcion.ilike.%${valor}%`)
      .limit(10);
    setResultados(data || []);
  };

  const startEdit = (item: ParteRow) => {
    setEditando(item);

    const aperturaParts = parseIsoDateParts(item.fecha_apertura);
    const cierreParts = parseIsoDateParts(item.fecha_cierre);
    const descParts = parseDescripcionParts(item.descripcion);

    const year = cierreParts.year || aperturaParts.year || "2021";
    const month = cierreParts.month || aperturaParts.month || "01";
    const dayAp = aperturaParts.day || "01";
    const dayCi = cierreParts.day || "01";

    setAnio(year);
    setMesProceso(month);
    setDiaApertura(dayAp);
    setDiaCierre(dayCi);
    setPpUltimos10(descParts.ppUltimos);
    setDetenidos(descParts.detenidos);
    setDelito(descParts.delito);
    setFojas(String(item.n_fojas || ""));
    setNTomo(String(item.n_tomo || "1"));
    setNCaja(String(item.n_caja || ""));
  };

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
        .limit(100);

      if (error) continue;

      const filas = (data || []) as unknown[];
      const normalizadas = filas
        .map((row) => {
          const registro = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          return normalizeUpper(String(registro[col] || ""));
        })
        .filter((d) => d.trim().length > 0);

      const uniqueDelitos = Array.from(new Set(normalizadas));
      uniqueDelitos.sort((a, b) => a.length - b.length);
      const suggestionsList = uniqueDelitos.slice(0, 15).map((d) => ({ delito: d }));
      setSugerencias(suggestionsList);
      return;
    }
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

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setIsLoading(true);

    const anioRegistro = normalizeYearInput(anio);
    if (anioRegistro.length !== 4) {
      setIsLoading(false);
      setNotification({ message: "El año debe tener 4 dígitos.", type: "error" });
      return;
    }

    const codigoPPFull = `PP-${anioRegistro}${mesProceso}${diaCierre.padStart(2, "0")}${ppUltimos10}`;
    const detenidosNormalizados = normalizeDetenidosForSave(detenidos);
    const delitoNormalizado = normalizeUpper(delito).trim();
    const descFinal = `${codigoPPFull}; DETENIDO(S): ${detenidosNormalizados}; DELITO: ${delitoNormalizado}`;

    const payload = {
      n_caja: nCaja,
      n_tomo: nTomo,
      n_fojas: fojas.substring(0, 3),
      fecha_apertura: `${anioRegistro}-${mesProceso}-${diaApertura.padStart(2, "0")}`,
      fecha_cierre: `${anioRegistro}-${mesProceso}-${diaCierre.padStart(2, "0")}`,
      descripcion: descFinal,
    };

    const { error } = await supabase.from(sourceTable).update(payload).eq("id", editando.id);
    setIsLoading(false);

    if (error) {
      setNotification({ message: `Error al actualizar: ${error.message}`, type: "error" });
    } else {
      setNotification({ message: "Registro actualizado con éxito", type: "success" });
      setEditando(null);
      handleSearch(busqueda);
    }
  };

  const requestEliminar = (id: string | number) => {
    setItemToDelete(id);
  };

  const confirmEliminar = async () => {
    if (!itemToDelete) return;
    const { error } = await supabase.from(sourceTable).delete().eq("id", itemToDelete);
    if (error) {
      setNotification({ message: "Error al eliminar", type: "error" });
    } else {
      setNotification({ message: "Registro eliminado con éxito", type: "success" });
      handleSearch(busqueda);
    }
    setItemToDelete(null);
  };

  const generarPDF = (item: ParteRow) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const width = doc.internal.pageSize.getWidth();

    doc.setLineWidth(0.5);
    doc.rect(10, 10, width - 20, 277);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("POLICÍA NACIONAL DEL ECUADOR", width / 2, 25, { align: "center" });
    doc.text("DIRECCIÓN NACIONAL DE INVESTIGACIÓN TÉCNICO CIENTÍFICA", width / 2, 31, { align: "center" });
    doc.text("POLICÍA JUDICIAL", width / 2, 37, { align: "center" });
    doc.line(40, 42, width - 40, 42);

    const esParte = item.descripcion?.toUpperCase().includes("PARTE");
    doc.setFontSize(18);
    doc.text(esParte ? "PARTE POLICIAL" : "INFORME DE INVESTIGACIÓN", width / 2, 60, { align: "center" });

    doc.setFontSize(11);
    const campos = [
      ["N° DE CAJA:", item.n_caja],
      ["EXPEDIENTE:", item.expediente],
      ["N° DE TOMO:", item.n_tomo],
      ["FECHA APERTURA:", item.fecha_apertura],
      ["FECHA CIERRE:", item.fecha_cierre],
      ["N° DE FOJAS:", item.n_fojas],
      ["DESTINO FINAL:", item.destino_final],
    ];

    let currentY = 85;
    campos.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label as string, 35, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(String(value || ""), 80, currentY);
      currentY += 12;
    });

    doc.setFont("helvetica", "bold");
    doc.text("DESCRIPCIÓN DOCUMENTAL:", 35, 175);
    doc.setFont("helvetica", "normal");
    const splitDesc = doc.splitTextToSize(item.descripcion || "", width - 70);
    doc.text(splitDesc, 35, 183, { align: "justify" });

    doc.save(`CARATULA_${item.expediente}.pdf`);
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
      {itemToDelete && (
        <ConfirmModal
          title="Confirmar Eliminación"
          message="¿ESTÁ SEGURO? Esta acción borrará el registro de la base de datos permanentemente."
          onConfirm={confirmEliminar}
          onCancel={() => setItemToDelete(null)}
        />
      )}

      {editando ? (
        <form onSubmit={handleUpdate} className="bg-white/5 rounded-3xl p-6 border border-indigo-500/30 space-y-4 animate-in slide-in-from-right-4 duration-300 max-w-4xl mx-auto shadow-2xl">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <h3 className="text-sm font-black text-indigo-400 italic uppercase">
              Modo Edición Partes: <span className="font-mono text-white">{editando.expediente}</span>
            </h3>
            <span className="text-[10px] text-white/50 bg-white/5 px-2.5 py-1 rounded-md font-mono">Tabla: {sourceTable}</span>
          </div>

          {/* CRONOLOGÍA / FECHAS */}
          <div className="grid grid-cols-4 gap-2 bg-black/60 p-2.5 rounded-xl border border-white/5">
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-white/30 uppercase">Año</label>
              <input
                type="text"
                maxLength={4}
                value={anio}
                onChange={(e) => setAnio(normalizeYearInput(e.target.value))}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-1 text-xs text-center text-white font-bold outline-none focus:border-indigo-500"
              />
            </div>
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-white/30 uppercase">Mes</label>
              <select
                value={mesProceso}
                onChange={(e) => setMesProceso(e.target.value)}
                className="w-full bg-neutral-900 text-white border border-white/10 rounded-lg py-1 text-xs outline-none"
              >
                {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => (
                  <option key={m} value={m} className="bg-neutral-900 text-white">{m}</option>
                ))}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-indigo-400 uppercase">Día Apert.</label>
              <select
                value={diaApertura}
                onChange={(e) => setDiaApertura(e.target.value)}
                className="w-full bg-neutral-900 text-white border border-white/10 rounded-lg py-1 text-xs outline-none"
              >
                {dias.map((d) => (
                  <option key={d} value={d} className="bg-neutral-900 text-white">{d}</option>
                ))}
              </select>
            </div>
            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-indigo-400 uppercase">Día Cierre</label>
              <select
                value={diaCierre}
                onChange={(e) => setDiaCierre(e.target.value)}
                className="w-full bg-neutral-900 text-white border border-white/10 rounded-lg py-1 text-xs outline-none"
              >
                {dias.map((d) => (
                  <option key={d} value={d} className="bg-neutral-900 text-white">{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* CÓDIGO PP (RECALCULADO CON FECHA) */}
          <div className="space-y-0.5">
            <label className="text-[8px] font-bold text-white/30 uppercase">Código PP (12 dígitos finales)</label>
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden h-9 focus-within:border-indigo-500">
              <span className="bg-white/10 px-3 h-full flex items-center text-[10px] font-mono text-indigo-300 font-bold">
                PP-{normalizeYearInput(anio)}{mesProceso}{diaCierre.padStart(2, "0")}
              </span>
              <input
                required
                type="text"
                maxLength={12}
                value={ppUltimos10}
                onChange={(e) => setPpUltimos10(e.target.value)}
                className="flex-1 bg-transparent px-3 text-sm text-white outline-none font-bold"
                placeholder="000000000000"
              />
            </div>
          </div>

          {/* DETENIDOS */}
          <div className="space-y-0.5">
            <label className="text-[8px] font-bold text-white/30 uppercase">Detenidos</label>
            <textarea
              required
              value={detenidos}
              onChange={(e) => setDetenidos(normalizeUpper(e.target.value))}
              onKeyDown={handleDetenidosKeyDown}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 h-14 resize-none custom-scrollbar"
              placeholder="NOMBRES DE LOS DETENIDOS..."
            />
          </div>

          {/* DELITO + FOJAS + TOMO + CAJA */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 relative">
            <div className="md:col-span-2 space-y-0.5 relative">
              <label className="text-[8px] font-bold text-white/30 uppercase">Delito</label>
              <input
                required
                type="text"
                value={delito}
                onChange={(e) => buscarDelitos(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                placeholder="Buscar delito..."
              />
              {sugerencias.length > 0 && (
                <ul className="absolute z-50 w-full bg-neutral-950 border border-white/10 rounded-xl mt-1 shadow-2xl max-h-32 overflow-y-auto custom-scrollbar">
                  {sugerencias.map((s, i) => (
                    <li
                      key={i}
                      onClick={() => { setDelito(normalizeUpper(s.delito)); setSugerencias([]); }}
                      className="p-2 text-[10px] text-white hover:bg-indigo-600 cursor-pointer border-b border-white/5 last:border-none uppercase transition-colors"
                    >
                      {s.delito}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-0.5">
              <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
              <input
                required
                type="text"
                maxLength={3}
                value={fojas}
                onChange={(e) => setFojas(e.target.value)}
                className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500"
                placeholder="0"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-0.5">
                <label className="text-[8px] font-bold text-white/30 uppercase">Tomo</label>
                <input
                  type="text"
                  value={nTomo}
                  onChange={(e) => setNTomo(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 text-center text-xs text-white outline-none focus:border-indigo-500"
                  placeholder="Tomo"
                />
              </div>
              <div className="space-y-0.5">
                <label className="text-[8px] font-bold text-white/30 uppercase">Caja</label>
                <input
                  type="text"
                  value={nCaja}
                  onChange={(e) => setNCaja(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2 text-center text-xs text-white outline-none focus:border-indigo-500"
                  placeholder="Caja"
                />
              </div>
            </div>
          </div>

          {/* VISTA PREVIA DE LA DESCRIPCIÓN RESULTANTE */}
          <div className="bg-black/40 p-2.5 rounded-xl border border-white/5 space-y-1">
            <span className="text-[8px] font-bold text-indigo-400 uppercase tracking-widest">Vista Previa Descripción:</span>
            <p className="text-[10px] font-mono text-white/80 break-all leading-tight">
              PP-{normalizeYearInput(anio)}{mesProceso}{diaCierre.padStart(2, "0")}{ppUltimos10}; DETENIDO(S): {normalizeDetenidosForSave(detenidos)}; DELITO: {normalizeUpper(delito).trim()}
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isLoading ? "bg-white/20 text-white/50 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              {isLoading ? "Guardando..." : "Guardar Cambios"}
            </button>
            <button
              type="button"
              onClick={() => setEditando(null)}
              className="px-6 bg-white/10 rounded-xl text-xs uppercase text-white hover:bg-white/20 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-4">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="🔍 Buscar por expediente o descripción..."
            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-indigo-500"
          />
          <div className="space-y-2">
            {resultados.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-indigo-500/20">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[10px] font-bold text-indigo-300 font-mono">{item.expediente}</span>
                  <span className="text-[9px] text-white/40 truncate max-w-[200px] md:max-w-[400px]">{item.descripcion}</span>
                  <span className="text-[8px] text-white/30 font-mono">
                    Apertura: {item.fecha_apertura || "N/A"} | Cierre: {item.fecha_cierre || "N/A"}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(item)} className="px-3 py-2 bg-white/10 rounded-lg text-[9px] font-bold uppercase hover:bg-white/20 text-white">Editar</button>
                  <button onClick={() => requestEliminar(item.id)} className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-[9px] font-bold uppercase hover:bg-red-500/20">Eliminar</button>
                  <button onClick={() => generarPDF(item)} className="px-3 py-2 bg-indigo-600 rounded-lg text-[9px] font-bold uppercase text-white">📄 PDF</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

