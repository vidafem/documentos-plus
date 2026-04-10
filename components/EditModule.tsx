"use client";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";
import ConfirmModal from "./ConfirmModal";

type DelegacionViejaRow = {
  id: string | number;
  expediente?: string;
  descripcion?: string;
  n_caja?: string;
  n_tomo?: string;
  fecha_apertura?: string;
  fecha_cierre?: string;
  n_fojas?: string | number;
  destino_final?: string;
  serie?: string;
  soporte?: string;
};

type EditFormState = {
  anioBase: string;
  mesBase: string;
  anioApertura: string;
  anioCierre: string;
  mesApertura: string;
  mesCierre: string;
  oficioAnio: string;
  nTomo: string;
  expedienteSufijo: string;
  diaApertura: string;
  diaCierre: string;
  fojas: string;
  oficioN: string;
  oficio4D: string;
  oficio6D: string;
  delito: string;
  sospechosos: string;
};

const initialEditForm: EditFormState = {
  anioBase: "2021",
  mesBase: "12",
  anioApertura: "2021",
  anioCierre: "2021",
  mesApertura: "12",
  mesCierre: "12",
  oficioAnio: "2021",
  nTomo: "",
  expedienteSufijo: "",
  diaApertura: "",
  diaCierre: "",
  fojas: "",
  oficioN: "",
  oficio4D: "",
  oficio6D: "",
  delito: "",
  sospechosos: "",
};

const normalizeYearInput = (value: string) => value.replace(/\D/g, "").slice(0, 4);

const parseIsoDateParts = (value: string) => {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return { year: "", month: "", day: "" };
  return { year: match[1], month: match[2], day: match[3] };
};

const toDisplayDate = (value: string): string => {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value || "");
  return `${match[3]}/${match[2]}/${match[1]}`;
};

const formatTitleCase = (str: string) => str.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());

const formatSospechososInput = (value: string) => {
  const normalized = formatTitleCase(value).replace(/\s+,/g, ",").replace(/,\s*/g, ", ");

  if (!normalized.endsWith(" ")) {
    return normalized;
  }

  const trimmedValue = normalized.trimEnd();
  const personas = trimmedValue.split(",").map((item) => item.trim());
  const ultimaPersona = personas[personas.length - 1] || "";
  const palabras = ultimaPersona.split(/\s+/).filter(Boolean);

  if (palabras.length === 4) {
    return `${personas.filter(Boolean).join(", ")}, `;
  }

  return normalized;
};

const countWords = (str: string): number => str.trim().split(/\s+/).filter((w) => w.length > 0).length;

const parseDescripcion = (descripcion: string) => {
  const text = String(descripcion || "");
  const oficioMatch = text.match(/Oficio\s*No\.?FPG-FEIFO(\d{1,2})-(\d{1,4})-(\d{4})-(\d+)-O/i);
  const delitoMatch = text.match(/Delito:\s*([^;]+?)(?:;|$)/i);
  const sospechososMatch = text.match(/Sospechoso(?:s)?:\s*(.+?)(?:\.\s*$|$)/i);

  return {
    oficioN: oficioMatch?.[1] ?? "",
    oficio4D: oficioMatch?.[2] ?? "",
    oficioAnio: oficioMatch?.[3] ?? "",
    oficio6D: oficioMatch?.[4] ?? "",
    delito: (delitoMatch?.[1] ?? "").trim(),
    sospechosos: (sospechososMatch?.[1] ?? "").trim(),
  };
};

const encodeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const replaceTemplateTokens = (template: string, values: Record<string, string>): string => {
  let html = template;
  const encoded = {
    descripcion: encodeHtml(values.descripcion),
    expediente: encodeHtml(values.expediente),
    apertura: encodeHtml(values.apertura),
    cierre: encodeHtml(values.cierre),
    fojas: encodeHtml(values.fojas),
    tomo: encodeHtml(values.tomo),
  };

  const replaceLiteral = (variants: string[], value: string) => {
    variants.forEach((variant) => {
      html = html.split(variant).join(value);
    });
  };

  replaceLiteral(["{{DESCRIPCION}}", "{{ DESCRIPCION }}"], encoded.descripcion);
  replaceLiteral(["{{N° DE EXPEDIENTE}}", "{{ N° DE EXPEDIENTE }}"], encoded.expediente);
  replaceLiteral(["{{APERTURA}}", "{{ APERTURA }}"], encoded.apertura);
  replaceLiteral(["{{CIERRE}}", "{{ CIERRE }}"], encoded.cierre);
  replaceLiteral(["{{N° FOJAS}}", "{{ N° FOJAS }}"], encoded.fojas);
  replaceLiteral(["{{N° DE TOMO}}", "{{ N° DE TOMO }}"], encoded.tomo);

  return html;
};

const normalizePdfTemplateHtml = (template: string): string => {
  if (typeof DOMParser === "undefined") {
    return template;
  }

  try {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(template, "text/html");
    const headStyles = Array.from(documentNode.head.querySelectorAll("style, link[rel='stylesheet']"))
      .map((node) => node.outerHTML)
      .join("\n");
    const bodyContent = documentNode.body.innerHTML.trim();
    return `${headStyles}\n${bodyContent}`.trim() || template;
  } catch {
    return template;
  }
};

export default function EditModule() {
  const COL_DELITO_CANDIDATAS = [
    "DELITO_TIPIFICADO_EN_DELEGACION",
    "delito_tipificado_en_delegacion",
  ];

  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<DelegacionViejaRow[]>([]);
  const [editando, setEditando] = useState<DelegacionViejaRow | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(initialEditForm);
  const [sugerenciasDelito, setSugerenciasDelito] = useState<{ delito: string }[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | number | null>(null);
  const [pdfTemplate, setPdfTemplate] = useState("");

  useEffect(() => {
    let active = true;
    const loadTemplate = async () => {
      try {
        const response = await fetch("/formatos/formato_delegaciones.html", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        if (active) {
          setPdfTemplate(normalizePdfTemplateHtml(html));
        }
      } catch (error) {
        if (active) {
          const msg = error instanceof Error ? error.message : "Error desconocido";
          setNotification({ message: `No se pudo cargar formato_delegaciones.html: ${msg}`, type: "error" });
        }
      }
    };
    void loadTemplate();
    return () => {
      active = false;
    };
  }, []);

  const handleSearch = async (valor: string) => {
    setBusqueda(valor);
    if (valor.length < 3) return setResultados([]);
    const { data } = await supabase
      .from("delegaciones_viejas")
      .select("*")
      .or(`expediente.ilike.%${valor}%,descripcion.ilike.%${valor}%`)
      .limit(10);
    setResultados((data || []) as DelegacionViejaRow[]);
  };

  const startEdit = (item: DelegacionViejaRow) => {
    const apertura = parseIsoDateParts(String(item.fecha_apertura || ""));
    const cierre = parseIsoDateParts(String(item.fecha_cierre || ""));
    const parsedDescripcion = parseDescripcion(String(item.descripcion || ""));
    const anioApertura = apertura.year || "2021";
    const expedientePrefijo = `IF-0901018${anioApertura.slice(-2).padStart(2, "0")}`;
    const expedienteValue = String(item.expediente || "");
    const expedienteSufijo = expedienteValue.startsWith(expedientePrefijo)
      ? expedienteValue.slice(expedientePrefijo.length)
      : expedienteValue;

    setEditando(item);
    setEditForm({
      anioBase: anioApertura,
      mesBase: apertura.month || "12",
      anioApertura,
      anioCierre: cierre.year || anioApertura,
      mesApertura: apertura.month || "12",
      mesCierre: cierre.month || apertura.month || "12",
      oficioAnio: parsedDescripcion.oficioAnio || anioApertura,
      nTomo: String(item.n_tomo || ""),
      expedienteSufijo,
      diaApertura: apertura.day || "",
      diaCierre: cierre.day || "",
      fojas: String(item.n_fojas || ""),
      oficioN: parsedDescripcion.oficioN,
      oficio4D: parsedDescripcion.oficio4D,
      oficio6D: parsedDescripcion.oficio6D,
      delito: parsedDescripcion.delito,
      sospechosos: parsedDescripcion.sospechosos,
    });
    setSugerenciasDelito([]);
  };

  const updateEditForm = (patch: Partial<EditFormState>) => {
    setEditForm((prev) => ({ ...prev, ...patch }));
  };

  const buscarDelitos = async (texto: string) => {
    updateEditForm({ delito: texto });
    if (texto.length < 3) {
      setSugerenciasDelito([]);
      return;
    }

    for (const col of COL_DELITO_CANDIDATAS) {
      const { data, error } = await supabase
        .from("delitos")
        .select(col)
        .ilike(col, `%${texto}%`)
        .limit(8);

      if (error) {
        continue;
      }

      const filas = (data || []) as unknown[];
      const normalizadas = filas
        .map((row) => {
          const registro = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          return { delito: String(registro[col] || "") };
        })
        .filter((row) => row.delito.trim().length > 0);

      setSugerenciasDelito(normalizadas);
      return;
    }

    setSugerenciasDelito([]);
  };

  const handleBaseYearChange = (value: string) => {
    const year = normalizeYearInput(value);
    updateEditForm({
      anioBase: year,
      anioApertura: year,
      anioCierre: year,
      oficioAnio: year,
    });
  };

  const handleBaseMonthChange = (value: string) => {
    updateEditForm({
      mesBase: value,
      mesApertura: value,
      mesCierre: value,
    });
  };

  const handleSospechososChange = (value: string) => {
    updateEditForm({ sospechosos: formatSospechososInput(value) });
  };

  const handleSospechososKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    updateEditForm({ sospechosos: formatSospechososInput(`${editForm.sospechosos} `) });
  };

  const requestEliminar = (id: string | number) => {
    setItemToDelete(id);
  };

  const confirmEliminar = async () => {
    if (!itemToDelete) return;
    const { error } = await supabase.from("delegaciones_viejas").delete().eq("id", itemToDelete);
    if (error) {
      setNotification({ message: "Error al eliminar", type: "error" });
    } else {
      setNotification({ message: "Registro eliminado con éxito", type: "success" });
      handleSearch(busqueda);
    }
    setItemToDelete(null);
  };

  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    setIsUpdating(true);

    const oficio6Numerico = editForm.oficio6D.replace(/\D/g, "");
    const oficio6Normalizado = oficio6Numerico.slice(-6).padStart(6, "0");
    const expedientePrefijo = `IF-0901018${(editForm.anioApertura || editForm.anioBase || "").slice(-2).padStart(2, "0")}`;
    const palabrasTotal = countWords(editForm.sospechosos);
    const labelSospechosos = palabrasTotal > 4 ? "Sospechosos" : "Sospechoso";
    const descFinal = `Oficio No.FPG-FEIFO${editForm.oficioN}-${editForm.oficio4D}-${editForm.oficioAnio}-${oficio6Normalizado}-O; Delito: ${formatTitleCase(editForm.delito)}; ${labelSospechosos}: ${formatTitleCase(editForm.sospechosos)}.`;

    const payload = {
      expediente: `${expedientePrefijo}${editForm.expedienteSufijo}`,
      n_tomo: editForm.nTomo,
      descripcion: descFinal,
      fecha_apertura: `${editForm.anioApertura}-${editForm.mesApertura}-${editForm.diaApertura.padStart(2, "0")}`,
      fecha_cierre: `${editForm.anioCierre}-${editForm.mesCierre}-${editForm.diaCierre.padStart(2, "0")}`,
      n_fojas: editForm.fojas,
      destino_final: "Eliminación",
      serie: "PROCEDIMIENTOS INVESTIGATIVOS POR DISPOSICIÓN JUDICIAL",
      soporte: "Fisico",
    };

    const { error } = await supabase.from("delegaciones_viejas").update(payload).eq("id", editando.id);

    setIsUpdating(false);
    if (error) {
      setNotification({ message: `Error al actualizar: ${error.message}`, type: "error" });
    } else {
      setNotification({ message: "Registro actualizado", type: "success" });
      setEditando(null);
      handleSearch(busqueda);
    }
  };

  const imprimirFilaPdf = (item: DelegacionViejaRow) => {
    if (!pdfTemplate) {
      setNotification({ message: "La plantilla de formato aún no se cargó.", type: "error" });
      return;
    }

    const templateFilled = replaceTemplateTokens(pdfTemplate, {
      descripcion: String(item.descripcion || ""),
      expediente: String(item.expediente || ""),
      apertura: toDisplayDate(String(item.fecha_apertura || "")),
      cierre: toDisplayDate(String(item.fecha_cierre || "")),
      fojas: String(item.n_fojas || ""),
      tomo: String(item.n_tomo || ""),
    });

    const ventana = window.open("", "_blank", "width=1200,height=800");
    if (!ventana) {
      setNotification({ message: "No se pudo abrir la ventana de impresión. Verifica que no esté bloqueada.", type: "error" });
      return;
    }

    ventana.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Carátula delegación</title>
  <style>
    @page { size: A4 landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; }
  </style>
</head>
<body>
${templateFilled}
<script>
  window.onload = function () {
    window.print();
  };
<\/script>
</body>
</html>`);
    ventana.document.close();
  };

  const expedientePrefijo = `IF-0901018${(editForm.anioApertura || editForm.anioBase || "").slice(-2).padStart(2, "0")}`;

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
        <form onSubmit={handleUpdate} className="bg-white/5 rounded-3xl p-6 border border-indigo-500/30 space-y-6 animate-in slide-in-from-right-4 duration-300">
          <h3 className="text-indigo-400 font-black text-xs uppercase tracking-widest">Modo Edición: {editando.expediente}</h3>

          <div className="flex flex-wrap items-end gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
            <div className="space-y-1 w-20">
              <label className="text-[10px] font-bold text-white/30 uppercase">Año</label>
              <input type="text" maxLength={4} value={editForm.anioBase} onChange={(e) => handleBaseYearChange(e.target.value)} className="w-full h-9 bg-white/10 border border-indigo-500/30 rounded-lg px-2 text-xs text-center text-white outline-none focus:border-indigo-500" />
            </div>

            <div className="space-y-1 w-24">
              <label className="text-[10px] font-bold text-white/30 uppercase">Mes</label>
              <select value={editForm.mesBase} onChange={(e) => handleBaseMonthChange(e.target.value)} className="w-full h-9 bg-neutral-900 border border-white/10 rounded-lg px-2 text-xs text-white outline-none">
                <option value="01">01 - Ene</option><option value="02">02 - Feb</option><option value="03">03 - Mar</option><option value="04">04 - Abr</option><option value="05">05 - May</option><option value="06">06 - Jun</option><option value="07">07 - Jul</option><option value="08">08 - Ago</option><option value="09">09 - Sep</option><option value="10">10 - Oct</option><option value="11">11 - Nov</option><option value="12">12 - Dic</option>
              </select>
            </div>

            <div className="space-y-1 w-20">
              <label className="text-[10px] font-bold text-white/30 uppercase">N° Tomo</label>
              <input type="text" maxLength={3} value={editForm.nTomo} onChange={(e) => updateEditForm({ nTomo: e.target.value })} className="w-full h-9 bg-white/10 border border-indigo-500/30 rounded-lg px-2 text-xs text-center text-white outline-none focus:border-indigo-500" placeholder="001" />
            </div>

            <div className="space-y-1 w-[190px]">
              <label className="text-[10px] font-black text-indigo-300 uppercase">Apertura</label>
              <div className="grid grid-cols-[44px_1fr_64px] gap-2">
                <input required type="text" maxLength={2} value={editForm.diaApertura} onChange={(e) => updateEditForm({ diaApertura: e.target.value })} className="h-9 bg-white/10 border border-white/10 rounded-lg px-1 text-xs text-center text-white outline-none focus:border-indigo-500" placeholder="DD" />
                <select value={editForm.mesApertura} onChange={(e) => updateEditForm({ mesApertura: e.target.value })} className="h-9 bg-neutral-900 border border-white/10 rounded-lg px-1 text-[10px] text-white outline-none">
                  <option value="01">Ene</option><option value="02">Feb</option><option value="03">Mar</option><option value="04">Abr</option><option value="05">May</option><option value="06">Jun</option><option value="07">Jul</option><option value="08">Ago</option><option value="09">Sep</option><option value="10">Oct</option><option value="11">Nov</option><option value="12">Dic</option>
                </select>
                <input type="text" maxLength={4} value={editForm.anioApertura} onChange={(e) => updateEditForm({ anioApertura: normalizeYearInput(e.target.value), oficioAnio: normalizeYearInput(e.target.value) })} className="h-9 bg-white/5 border border-white/10 rounded-lg px-1 text-xs text-center text-white outline-none focus:border-indigo-500" />
              </div>
            </div>

            <div className="space-y-1 w-[190px]">
              <label className="text-[10px] font-black text-indigo-300 uppercase">Cierre</label>
              <div className="grid grid-cols-[44px_1fr_64px] gap-2">
                <input required type="text" maxLength={2} value={editForm.diaCierre} onChange={(e) => updateEditForm({ diaCierre: e.target.value })} className="h-9 bg-white/10 border border-white/10 rounded-lg px-1 text-xs text-center text-white outline-none focus:border-indigo-500" placeholder="DD" />
                <select value={editForm.mesCierre} onChange={(e) => updateEditForm({ mesCierre: e.target.value })} className="h-9 bg-neutral-900 border border-white/10 rounded-lg px-1 text-[10px] text-white outline-none">
                  <option value="01">Ene</option><option value="02">Feb</option><option value="03">Mar</option><option value="04">Abr</option><option value="05">May</option><option value="06">Jun</option><option value="07">Jul</option><option value="08">Ago</option><option value="09">Sep</option><option value="10">Oct</option><option value="11">Nov</option><option value="12">Dic</option>
                </select>
                <input type="text" maxLength={4} value={editForm.anioCierre} onChange={(e) => updateEditForm({ anioCierre: normalizeYearInput(e.target.value) })} className="h-9 bg-white/5 border border-white/10 rounded-lg px-1 text-xs text-center text-white outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>

          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-white/50 font-mono">Oficio No.FPG-FEIFO</span>
              <input required type="text" maxLength={2} value={editForm.oficioN} onChange={(e) => updateEditForm({ oficioN: e.target.value })} className="w-10 bg-white/10 border border-white/10 rounded-lg p-1 text-xs text-center outline-none focus:border-indigo-500" placeholder="00" />
              <span className="text-white/30">-</span>
              <input required type="text" maxLength={4} value={editForm.oficio4D} onChange={(e) => updateEditForm({ oficio4D: e.target.value })} className="w-14 bg-white/10 border border-white/10 rounded-lg p-1 text-xs text-center outline-none focus:border-indigo-500" placeholder="0000" />
              <span className="text-white/30">-</span>
              <span className="w-14 bg-white/10 border border-white/10 rounded-lg p-1 text-xs text-center text-indigo-300 font-bold flex items-center justify-center">{editForm.oficioAnio}</span>
              <span className="text-white/30">-</span>
              <input required type="text" value={editForm.oficio6D} onChange={(e) => updateEditForm({ oficio6D: e.target.value })} className="w-20 bg-white/10 border border-white/10 rounded-lg p-1 text-xs text-center outline-none focus:border-indigo-500" placeholder="000000" />
              <span className="text-[10px] text-white/50 font-mono">-O</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase">N° de Expediente</label>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500 transition-all">
                <span className="bg-white/10 px-2 py-2 text-[10px] text-white/40 font-mono">{expedientePrefijo}</span>
                <input required type="text" value={editForm.expedienteSufijo} onChange={(e) => updateEditForm({ expedienteSufijo: e.target.value })} className="flex-1 bg-transparent p-2 text-xs text-white outline-none" />
              </div>
            </div>

            <div className="space-y-1 relative">
              <label className="text-[10px] font-bold text-white/30 uppercase">Delito</label>
              <input required type="text" value={editForm.delito} onChange={(e) => buscarDelitos(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500" placeholder="Ej: tenencia..." autoComplete="off" />
              {sugerenciasDelito.length > 0 && (
                <ul className="absolute z-50 w-full bg-neutral-900 border border-white/10 rounded-xl mt-1 shadow-2xl max-h-40 overflow-y-auto overflow-x-hidden">
                  {sugerenciasDelito.map((s, i) => (
                    <li
                      key={i}
                      onClick={() => {
                        updateEditForm({ delito: s.delito });
                        setSugerenciasDelito([]);
                      }}
                      className="p-3 text-[10px] text-white hover:bg-indigo-600 cursor-pointer border-b border-white/5 last:border-none transition-colors"
                    >
                      {s.delito}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[260px] space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase">Sospechosos</label>
              <input required type="text" value={editForm.sospechosos} onChange={(e) => handleSospechososChange(e.target.value)} onKeyDown={handleSospechososKeyDown} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500" placeholder="Nombres..." />
            </div>

            <div className="w-20 space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase">Fojas</label>
              <input required type="text" maxLength={3} value={editForm.fojas} onChange={(e) => updateEditForm({ fojas: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-center text-white outline-none focus:border-indigo-500" placeholder="000" />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setEditando(null)} className="px-6 bg-white/10 rounded-xl text-xs uppercase text-white h-10">Cancelar</button>
            <button type="submit" disabled={isUpdating} className="px-10 rounded-2xl font-black text-[11px] uppercase shadow-2xl transition-all active:scale-95 tracking-tighter flex items-center gap-2 h-10 bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-white/20 disabled:text-white/50 disabled:cursor-wait">
              {isUpdating ? "Procesando..." : "Actualizar Registro"}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-4">
          <input type="text" value={busqueda} onChange={(e) => handleSearch(e.target.value)} placeholder="🔍 Buscar por expediente o descripción..." className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-indigo-500" />
          <div className="space-y-2">
            {resultados.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-indigo-500/20">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[10px] font-bold text-indigo-300 font-mono">{item.expediente}</span>
                  <span className="text-[9px] text-white/40 truncate max-w-[200px] md:max-w-[400px]">{item.descripcion}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => startEdit(item)} className="px-3 py-2 bg-white/10 rounded-lg text-[9px] font-bold uppercase hover:bg-white/20 text-white">Editar</button>
                  <button onClick={() => requestEliminar(item.id)} className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-[9px] font-bold uppercase hover:bg-red-500/20">Eliminar</button>
                  <button onClick={() => imprimirFilaPdf(item)} className="px-3 py-2 bg-indigo-600 rounded-lg text-[9px] font-bold uppercase text-white">Imprimir PDF</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
