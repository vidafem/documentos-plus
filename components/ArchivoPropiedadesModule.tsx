"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import JSZip from "jszip";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

type GenericRow = Record<string, unknown>;

const ARCHIVO_HEADERS = [
  { label: "SERIE/SUBSERIE_DOCUMENTAL", keys: ["SERIE/SUBSERIE_DOCUMENTAL", "SERIE_SUBSERIE_DOCUMENTAL", "serie_subserie_documental"] },
  { label: "N°CAJA", keys: ["N°CAJA", "N_CAJA", "n_caja"] },
  { label: "N°_DE_EXPEDIENTE", keys: ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente"] },
  { label: "N°_DE_TOMO", keys: ["N°_DE_TOMO", "N_DE_TOMO", "N_TOMO", "n_tomo"] },
  { label: "DESCRIPCIÓN", keys: ["DESCRIPCIÓN", "DESCRIPCION", "descripcion"] },
  { label: "APERTURA", keys: ["APERTURA", "FECHA_APERTURA", "fecha_apertura"] },
  { label: "CIERRE", keys: ["CIERRE", "FECHA_CIERRE", "fecha_cierre"] },
  { label: "N°FOJAS", keys: ["N°FOJAS", "N_FOJAS", "n_fojas"] },
  { label: "DESTINO_FINAL", keys: ["DESTINO_FINAL", "destino_final"] },
  { label: "SOPORTE", keys: ["SOPORTE", "soporte"] },
] as const;

const toText = (value: unknown): string => String(value ?? "").trim();

const readFirstValue = (row: GenericRow, possibleKeys: readonly string[]): string => {
  for (const key of possibleKeys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return "";
};

const normalizeDateValue = (value: string): string => {
  const raw = value.trim();
  if (!raw) return "";

  const firstChunk = raw.split(" ")[0];

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(firstChunk)) {
    const [y, m, d] = firstChunk.split(/[/-]/);
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      return "";
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(firstChunk)) {
    const [d, m, y] = firstChunk.split(/[/-]/);
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      !Number.isFinite(year) ||
      !Number.isFinite(month) ||
      !Number.isFinite(day) ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day
    ) {
      return "";
    }
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return "";
};

const toDisplayDate = (value: string): string => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return value;
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
};

const toNullableDateIso = (value: unknown): string | null => {
  const normalized = normalizeDateValue(String(value ?? ""));
  return normalized || null;
};

const toNullableInteger = (value: unknown): number | null => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
};

const toSortableDateNumber = (value: unknown): number => {
  const normalized = normalizeDateValue(String(value ?? ""));
  if (!normalized) return 0;
  const [year, month, day] = normalized.split("-");
  return Number(`${year}${month}${day}`);
};

const sortRowsByCierreAndId = (rows: GenericRow[]): GenericRow[] => {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const aDate = toSortableDateNumber(readFirstValue(a, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));
    const bDate = toSortableDateNumber(readFirstValue(b, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));
    if (aDate !== bDate) return aDate - bDate;
    const aId = Number(a.id ?? 0);
    const bId = Number(b.id ?? 0);
    if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;
    const aExp = readFirstValue(a, ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente"]);
    const bExp = readFirstValue(b, ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente"]);
    return aExp.localeCompare(bExp);
  });
  return sorted;
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

  const replaceMany = (patterns: RegExp[], value: string) => {
    patterns.forEach((pattern) => {
      html = html.replace(pattern, value);
    });
  };

  replaceLiteral(["{{DESCRIPCION}}", "{{ DESCRIPCION }}"], encoded.descripcion);
  replaceMany([/\{\{\s*DESCRIPCION\s*\}\}/g], encoded.descripcion);
  replaceLiteral(
    [
      "{{N° DE EXPEDIENTE}}",
      "{{ N° DE EXPEDIENTE }}",
      "{{Nº DE EXPEDIENTE}}",
      "{{ Nº DE EXPEDIENTE }}",
      "{{N&deg; DE EXPEDIENTE}}",
      "{{ N&deg; DE EXPEDIENTE }}",
      "{{N&#176; DE EXPEDIENTE}}",
      "{{ N&#176; DE EXPEDIENTE }}",
    ],
    encoded.expediente
  );
  replaceMany(
    [
      /\{\{\s*N°\s*DE\s*EXPEDIENTE\s*\}\}/g,
      /\{\{\s*Nº\s*DE\s*EXPEDIENTE\s*\}\}/g,
      /\{\{\s*N&deg;\s*DE\s*EXPEDIENTE\s*\}\}/g,
      /\{\{\s*N&#176;\s*DE\s*EXPEDIENTE\s*\}\}/g,
      /\{\{\s*N(?:°|&deg;)\s*DE\s*EXPEDIENTE\s*\}\}/g,
    ],
    encoded.expediente
  );
  replaceLiteral(["{{APERTURA}}", "{{ APERTURA }}"], encoded.apertura);
  replaceMany([/\{\{\s*APERTURA\s*\}\}/g], encoded.apertura);
  replaceLiteral(["{{CIERRE}}", "{{ CIERRE }}"], encoded.cierre);
  replaceMany([/\{\{\s*CIERRE\s*\}\}/g], encoded.cierre);
  replaceLiteral(["{{N° FOJAS}}", "{{ N° FOJAS }}", "{{N&deg; FOJAS}}", "{{ N&deg; FOJAS }}"], encoded.fojas);
  replaceMany([/\{\{\s*N°\s*FOJAS\s*\}\}/g, /\{\{\s*N&deg;\s*FOJAS\s*\}\}/g, /\{\{\s*N&#176;\s*FOJAS\s*\}\}/g, /\{\{\s*N(?:°|&deg;)\s*FOJAS\s*\}\}/g], encoded.fojas);
  replaceLiteral(["{{N° DE TOMO}}", "{{ N° DE TOMO }}", "{{N&deg; DE TOMO}}", "{{ N&deg; DE TOMO }}"], encoded.tomo);
  replaceMany(
    [
      /\{\{\s*N°\s*DE\s*TOMO\s*\}\}/g,
      /\{\{\s*Nº\s*DE\s*TOMO\s*\}\}/g,
      /\{\{\s*N&deg;\s*DE\s*TOMO\s*\}\}/g,
      /\{\{\s*N&#176;\s*DE\s*TOMO\s*\}\}/g,
      /\{\{\s*N(?:°|&deg;)\s*DE\s*TOMO\s*\}\}/g,
    ],
    encoded.tomo
  );

  return html;
};

const normalizePdfTemplateHtml = (template: string): string => {
  if (typeof DOMParser === "undefined") return template;
  try {
    const parser = new DOMParser();
    const documentNode = parser.parseFromString(template, "text/html");
    const headStyles = Array.from(documentNode.head.querySelectorAll("style, link[rel='stylesheet']"))
      .map((node) => node.outerHTML)
      .join("\n");
    const bodyContent = documentNode.body.innerHTML.trim();
    if (!headStyles && !bodyContent) return template;
    return `${headStyles}\n${bodyContent}`.trim();
  } catch {
    return template;
  }
};

const toTitleCase = (value: string): string => {
  const cleaned = value.toLowerCase().replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
};

const isoDateToExcelSerial = (value: string): number | null => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return null;
  const [yearText, monthText, dayText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const utcValue = Date.UTC(year, month - 1, day);
  const excelEpoch = Date.UTC(1899, 11, 30);
  return (utcValue - excelEpoch) / 86400000;
};

const getMonthDateRange = (year: string, month: string): { start: string; end: string; nextMonthStart: string } | null => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const startDate = new Date(y, m - 1, 1);
  const endDate = new Date(y, m, 0);
  const nextMonthDate = new Date(y, m, 1);
  const formatDateIso = (d: Date): string => {
    const yr = d.getFullYear();
    const mn = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    return `${yr}/${mn}/${dy}`;
  };
  return { start: formatDateIso(startDate), end: formatDateIso(endDate), nextMonthStart: formatDateIso(nextMonthDate) };
};

const YEAR_OPTIONS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019"];
const MONTH_OPTIONS = [
  { value: "01", label: "01 - Enero" },
  { value: "02", label: "02 - Febrero" },
  { value: "03", label: "03 - Marzo" },
  { value: "04", label: "04 - Abril" },
  { value: "05", label: "05 - Mayo" },
  { value: "06", label: "06 - Junio" },
  { value: "07", label: "07 - Julio" },
  { value: "08", label: "08 - Agosto" },
  { value: "09", label: "09 - Septiembre" },
  { value: "10", label: "10 - Octubre" },
  { value: "11", label: "11 - Noviembre" },
  { value: "12", label: "12 - Diciembre" },
] as const;


const buildIsoDate = (year: string, month: string, day: string): string => {
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

export default function ArchivoPropiedadesModule() {
  const [activeTab, setActiveTab] = useState<"ingresar" | "consultar">("ingresar");
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  /* ─────────────────── TEMPLATE HANDLERS ─────────────────── */
  const [availableTemplates, setAvailableTemplates] = useState<{ filename: string; displayName: string }[]>([]);
  const [selectedTemplateFilename, setSelectedTemplateFilename] = useState("formato_delegaciones.html");
  const [pdfTemplate, setPdfTemplate] = useState("");

  useEffect(() => {
    let active = true;
    const fetchTemplatesList = async () => {
      try {
        const res = await fetch("/api/formatos");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (active && data.templates) {
          setAvailableTemplates(data.templates);
          const hasDefault = data.templates.some(
            (t: { filename: string; displayName: string }) => t.filename === "formato_delegaciones.html"
          );
          if (!hasDefault && data.templates.length > 0) {
            setSelectedTemplateFilename(data.templates[0].filename);
          }
        }
      } catch (err) {
        console.error("Error al obtener la lista de formatos:", err);
      }
    };
    void fetchTemplatesList();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const loadTemplate = async () => {
      try {
        const response = await fetch(`/formatos/${selectedTemplateFilename}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        if (active) setPdfTemplate(normalizePdfTemplateHtml(html));
      } catch (error) {
        if (active) {
          const msg = error instanceof Error ? error.message : "Error desconocido";
          setNotification({ message: `No se pudo cargar la plantilla ${selectedTemplateFilename}: ${msg}`, type: "error" });
        }
      }
    };
    void loadTemplate();
    return () => { active = false; };
  }, [selectedTemplateFilename]);

  /* ─────────────────── FORM STATE (PERSISTENT) ─────────────────── */
  const [globalYear, setGlobalYear] = useState(() => String(new Date().getFullYear()));
  const [caja, setCaja] = useState("N/A");
  const [tomo, setTomo] = useState("1/1");
  const [expedienteSeq, setExpedienteSeq] = useState("");
  const [expedienteYear, setExpedienteYear] = useState(() => String(new Date().getFullYear()).slice(-2));
  const [isDuplicate, setIsDuplicate] = useState(false);

  // Description components
  const [descFpg, setDescFpg] = useState("Oficio No. FPG-FDACE");
  const [descDigit, setDescDigit] = useState("3");
  const [descMidNums, setDescMidNums] = useState("6594");
  const [descYear, setDescYear] = useState(() => String(new Date().getFullYear()));
  const [descSeq, setDescSeq] = useState("");
  const [delitoQuery, setDelitoQuery] = useState("");
  const [delitoSuggestions, setDelitoSuggestions] = useState<{ DELITO: string }[]>([]);
  const [selectedDelito, setSelectedDelito] = useState("");
  const [denunciante, setDenunciante] = useState("");
  const [sospechoso, setSospechoso] = useState("");

  // Dates
  const [aperturaYear, setAperturaYear] = useState(() => String(new Date().getFullYear()));
  const [aperturaMonth, setAperturaMonth] = useState("01");
  const [aperturaDay, setAperturaDay] = useState("01");

  const [cierreYear, setCierreYear] = useState(() => String(new Date().getFullYear()));
  const [cierreMonth, setCierreMonth] = useState("12");
  const [cierreDay, setCierreDay] = useState("31");

  // Rest
  const [fojas, setFojas] = useState("");
  const destinoFinal = "Eliminación";
  const soporte = "Fisico";
  const [ubicacion, setUbicacion] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [saving, setSaving] = useState(false);

  // Auto-sync dates & years when globalYear changes
  useEffect(() => {
    setDescYear(globalYear);
    setAperturaYear(globalYear);
    setCierreYear(globalYear);
    setExpedienteYear(globalYear.slice(-2));
  }, [globalYear]);

  // Compute final expediente
  const finalExpediente = useMemo(() => {
    return `I.P.0901018${expedienteYear}${expedienteSeq.trim()}`;
  }, [expedienteYear, expedienteSeq]);

  // Check duplicate expediente (with debounce)
  useEffect(() => {
    if (!expedienteSeq.trim()) {
      setIsDuplicate(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("arch_prop")
          .select("id")
          .eq("expediente", finalExpediente)
          .maybeSingle();

        if (error) throw error;
        setIsDuplicate(!!data);
      } catch (err) {
        console.error("Error al validar duplicado de expediente:", err);
      }
    }, 4000);

    return () => clearTimeout(timer);
  }, [finalExpediente, expedienteSeq]);

  // Fetch Delitos suggestions
  const fetchDelitos = async (text: string) => {
    setDelitoQuery(text);
    if (text.trim().length < 2) {
      setDelitoSuggestions([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from("delitos")
        .select("DELITO")
        .ilike("DELITO", `%${text}%`)
        .limit(100);

      if (error) throw error;

      // Remove duplicates and empty values
      const uniqueDelitos = Array.from(
        new Set((data || []).map((item) => String(item.DELITO || "").trim()).filter(Boolean))
      );

      // Sort by length (fewer characters first)
      uniqueDelitos.sort((a, b) => a.length - b.length);

      // Select top 15 matches
      const suggestionsList = uniqueDelitos.slice(0, 15).map((d) => ({ DELITO: d }));

      setDelitoSuggestions(suggestionsList);
    } catch (err) {
      console.error("Error al buscar delitos:", err);
    }
  };

  // Autocomplete sequence ZZZZZZ to 6 digits
  const formatSixDigits = (val: string): string => {
    const digits = val.replace(/\D/g, "");
    if (!digits) return "";
    return digits.slice(-6).padStart(6, "0");
  };

  // Compile DESCRIPTION field
  const finalDescripcion = useMemo(() => {
    const seqPadded = formatSixDigits(descSeq);
    const delitoPart = `,  Delito:  ${selectedDelito}`;
    const denuncPart = `,  Denunciante:  ${toTitleCase(denunciante)}`;
    const sospPart = `,  Sospechoso:  ${toTitleCase(sospechoso)}`;

    return `${descFpg.trim()}${descDigit.trim()}-${descMidNums.trim()}-${descYear.trim()}-${seqPadded}-O${delitoPart}${denuncPart}${sospPart}`;
  }, [descFpg, descDigit, descMidNums, descYear, descSeq, selectedDelito, denunciante, sospechoso]);

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!expedienteSeq.trim()) {
      setNotification({ message: "Por favor ingresa el número secuencial de expediente.", type: "error" });
      return;
    }
    if (isDuplicate) {
      setNotification({ message: "No se puede guardar: El expediente ya existe y está duplicado (color rojo).", type: "error" });
      return;
    }

    const aperturaIso = buildIsoDate(aperturaYear, aperturaMonth, aperturaDay);
    const cierreIso = buildIsoDate(cierreYear, cierreMonth, cierreDay);

    if (!aperturaIso || !cierreIso) {
      setNotification({ message: "Fechas de apertura o cierre no válidas.", type: "error" });
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase
        .from("arch_prop")
        .insert({
          n_caja: caja,
          expediente: finalExpediente,
          n_tomo: tomo,
          descripcion: finalDescripcion,
          fecha_apertura: aperturaIso,
          fecha_cierre: cierreIso,
          n_fojas: toNullableInteger(fojas),
          destino_final: destinoFinal,
          soporte: soporte,
          ubicacion: ubicacion,
          observaciones: observaciones,
        });

      if (error) throw error;

      setNotification({ message: "¡Registro guardado correctamente!", type: "success" });
      // Reset only non-persistent sequential fields
      setExpedienteSeq("");
      setDescSeq("");
      setDenunciante("");
      setSospechoso("");
      setSelectedDelito("");
      setDelitoQuery("");
      setFojas("");
      setUbicacion("");
      setObservaciones("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al guardar el registro.";
      setNotification({ message: msg, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  /* ─────────────────── CONSULTING TAB STATES ─────────────────── */
  const [searchExpediente, setSearchExpediente] = useState("");
  const [filterYear, setFilterYear] = useState(() => String(new Date().getFullYear()));
  const [filterMonth, setFilterMonth] = useState("");
  const [records, setRecords] = useState<GenericRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Edit modal state
  const [editingRecord, setEditingRecord] = useState<GenericRow | null>(null);
  const [editCaja, setEditCaja] = useState("");
  const [editTomo, setEditTomo] = useState("");
  const [editExpediente, setEditExpediente] = useState("");
  const [editDescripcion, setEditDescripcion] = useState("");
  const [editApertura, setEditApertura] = useState("");
  const [editCierre, setEditCierre] = useState("");
  const [editFojas, setEditFojas] = useState("");
  const [editDestino, setEditDestino] = useState("");
  const [editSoporte, setEditSoporte] = useState("");
  const [editUbicacion, setEditUbicacion] = useState("");
  const [editObservaciones, setEditObservaciones] = useState("");
  const [updating, setUpdating] = useState(false);

  // Fetch filtered data
  const handleQuery = async () => {
    setLoading(true);
    try {
      let query = supabase.from("arch_prop").select("*");

      if (filterYear && filterMonth) {
        const range = getMonthDateRange(filterYear, filterMonth);
        if (range) {
          query = query.gte("fecha_cierre", range.start).lt("fecha_cierre", range.nextMonthStart);
        }
      } else if (filterYear) {
        query = query.gte("fecha_cierre", `${filterYear}-01-01`).lte("fecha_cierre", `${filterYear}-12-31`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setRecords(sortRowsByCierreAndId(data || []));
      setHasSearched(true);
    } catch (err) {
      console.error(err);
      setNotification({ message: "No se pudieron cargar los registros del archivo.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // Combine query and search query
  const displayedRecords = useMemo(() => {
    if (!searchExpediente.trim()) return records;
    const term = searchExpediente.trim().toUpperCase();
    return records.filter((r) => {
      const exp = readFirstValue(r, ["N°_DE_EXPEDIENTE", "expediente", "EXPEDIENTE"]).toUpperCase();
      return exp.includes(term);
    });
  }, [records, searchExpediente]);

  // Open Edit Modal
  const openEdit = (row: GenericRow) => {
    setEditingRecord(row);
    setEditCaja(toText(row["N°CAJA"]));
    setEditTomo(toText(row["N°_DE_TOMO"]));
    setEditExpediente(toText(row["N°_DE_EXPEDIENTE"]));
    setEditDescripcion(toText(row["DESCRIPCIÓN"]));
    setEditApertura(toText(row["APERTURA"]));
    setEditCierre(toText(row["CIERRE"]));
    setEditFojas(toText(row["N°FOJAS"]));
    setEditDestino(toText(row["DESTINO_FINAL"]));
    setEditSoporte(toText(row["SOPORTE"]));
    setEditUbicacion(toText(row["UBICACIÓN"] || row["ubicacion"]));
    setEditObservaciones(toText(row["OBSERVACIONES"] || row["observaciones"]));
  };

  // Save Edit Row
  const handleUpdate = async () => {
    if (!editingRecord) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("arch_prop")
        .update({
          n_caja: editCaja,
          expediente: editExpediente,
          n_tomo: editTomo,
          descripcion: editDescripcion,
          fecha_apertura: toNullableDateIso(editApertura),
          fecha_cierre: toNullableDateIso(editCierre),
          n_fojas: toNullableInteger(editFojas),
          destino_final: editDestino,
          soporte: editSoporte,
          ubicacion: editUbicacion,
          observaciones: editObservaciones,
        })
        .eq("id", editingRecord.id);

      if (error) throw error;

      setNotification({ message: "Registro actualizado.", type: "success" });
      setEditingRecord(null);
      void handleQuery();
    } catch (err) {
      console.error(err);
      setNotification({ message: "No se pudo actualizar el registro.", type: "error" });
    } finally {
      setUpdating(false);
    }
  };

  // Delete Row
  const handleDelete = async (id: unknown) => {
    if (!confirm("¿Estás seguro de que deseas eliminar este registro de manera definitiva?")) return;
    try {
      const { error } = await supabase.from("arch_prop").delete().eq("id", id);
      if (error) throw error;
      setNotification({ message: "Registro eliminado con éxito.", type: "success" });
      void handleQuery();
    } catch (err) {
      console.error(err);
      setNotification({ message: "No se pudo eliminar el registro.", type: "error" });
    }
  };

  /* ─────────────────── PRINT & EXPORTS ─────────────────── */
  const imprimirFilaPdf = (row: GenericRow) => {
    if (!pdfTemplate) {
      setNotification({ message: "La plantilla de formato aún no se cargó.", type: "error" });
      return;
    }

    const templateFilled = replaceTemplateTokens(pdfTemplate, {
      descripcion: toText(readFirstValue(row, ARCHIVO_HEADERS[4].keys)),
      expediente: getExpedienteFromRow(row),
      apertura: toDisplayDate(toText(readFirstValue(row, ARCHIVO_HEADERS[5].keys))),
      cierre: toDisplayDate(getCierreFromRow(row)),
      fojas: toText(readFirstValue(row, ARCHIVO_HEADERS[7].keys)),
      tomo: toText(readFirstValue(row, ARCHIVO_HEADERS[3].keys)),
    });

    const ventana = window.open("", "_blank", "width=1200,height=800");
    if (!ventana) {
      setNotification({ message: "No se pudo abrir la ventana de impresión.", type: "error" });
      return;
    }

    ventana.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Carátula delegación</title>
  <style>
    @page { size: A4 landscape; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #fff;
    }
    .folder-cover {
      margin: 0 !important;
      width: 95% !important;
      max-width: 1050px !important;
    }
  </style>
</head>
<body>
  ${templateFilled}
</body>
</html>`);
    ventana.document.close();
    ventana.focus();
    ventana.onload = () => { ventana.print(); ventana.close(); };
  };

  const getExpedienteFromRow = (row: GenericRow): string =>
    toText(readFirstValue(row, ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente"]));

  const getCierreFromRow = (row: GenericRow): string =>
    toText(readFirstValue(row, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));

  const createPdfBlobForRow = async (row: GenericRow): Promise<Blob> => {
    if (!pdfTemplate) throw new Error("La plantilla HTML aún no se cargó.");

    const templateFilled = replaceTemplateTokens(pdfTemplate, {
      descripcion: toText(readFirstValue(row, ARCHIVO_HEADERS[4].keys)),
      expediente: getExpedienteFromRow(row),
      apertura: toDisplayDate(toText(readFirstValue(row, ARCHIVO_HEADERS[5].keys))),
      cierre: toDisplayDate(getCierreFromRow(row)),
      fojas: toText(readFirstValue(row, ARCHIVO_HEADERS[7].keys)),
      tomo: toText(readFirstValue(row, ARCHIVO_HEADERS[3].keys)),
    });

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-100000px";
    container.style.top = "0";
    container.style.width = "1123px";
    container.style.minHeight = "794px";
    container.style.background = "#ffffff";
    container.style.color = "#000000";
    container.style.fontFamily = "Arial, Helvetica, sans-serif";
    container.style.padding = "24px";
    container.style.boxSizing = "border-box";
    container.style.display = "flex";
    container.style.justifyContent = "center";
    container.style.alignItems = "center";
    container.innerHTML = `
      <style>
        * { color: #000 !important; -webkit-text-fill-color: #000 !important; }
        img { display: block; }
      </style>
      ${templateFilled}
    `;

    document.body.appendChild(container);

    const images = Array.from(container.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) { resolve(); return; }
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          })
      )
    );

    const canvas = await html2canvas(container, {
      scale: 3,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      windowWidth: container.scrollWidth,
      windowHeight: container.scrollHeight,
    });

    document.body.removeChild(container);

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const imgData = canvas.toDataURL("image/png");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 6;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;
    const canvasRatio = canvas.width / canvas.height;
    let renderWidth = maxWidth;
    let renderHeight = renderWidth / canvasRatio;
    if (renderHeight > maxHeight) { renderHeight = maxHeight; renderWidth = renderHeight * canvasRatio; }
    const offsetX = (pageWidth - renderWidth) / 2;
    const offsetY = (pageHeight - renderHeight) / 2;
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.addImage(imgData, "PNG", offsetX, offsetY, renderWidth, renderHeight, undefined, "FAST");

    return pdf.output("blob");
  };

  const descargarTodosPdfZip = async () => {
    if (displayedRecords.length === 0) {
      setNotification({ message: "No hay registros para descargar.", type: "info" });
      return;
    }
    if (!pdfTemplate) {
      setNotification({ message: "La plantilla no se ha cargado.", type: "error" });
      return;
    }

    setPdfAllLoading(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < displayedRecords.length; i++) {
        const row = displayedRecords[i];
        const blob = await createPdfBlobForRow(row);
        const expediente = getExpedienteFromRow(row) || `caratula_${i + 1}`;
        const cierre = getCierreFromRow(row) || "SIN_CIERRE";
        const safeName = `${expediente}_${cierre}`.replace(/[\\/:*?"<>|]/g, "_");
        zip.file(`${String(i + 1).padStart(3, "0")}_${safeName}.pdf`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const stamp = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CARATULAS_PROPIEDADES_${stamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setNotification({ message: `Se generaron ${displayedRecords.length} PDFs en ZIP.`, type: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setNotification({ message: `Error: ${msg}`, type: "error" });
    } finally {
      setPdfAllLoading(false);
    }
  };

  const descargarTodosPdfUnificado = async () => {
    if (displayedRecords.length === 0) {
      setNotification({ message: "No hay registros para descargar.", type: "info" });
      return;
    }
    if (!pdfTemplate) {
      setNotification({ message: "La plantilla no se ha cargado.", type: "error" });
      return;
    }

    setPdfMergedLoading(true);
    try {
      const mergedPdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = mergedPdf.internal.pageSize.getWidth();
      const pageHeight = mergedPdf.internal.pageSize.getHeight();
      const margin = 6;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;

      for (let i = 0; i < displayedRecords.length; i++) {
        const row = displayedRecords[i];

        const templateFilled = replaceTemplateTokens(pdfTemplate, {
          descripcion: toText(readFirstValue(row, ARCHIVO_HEADERS[4].keys)),
          expediente: getExpedienteFromRow(row),
          apertura: toDisplayDate(toText(readFirstValue(row, ARCHIVO_HEADERS[5].keys))),
          cierre: toDisplayDate(getCierreFromRow(row)),
          fojas: toText(readFirstValue(row, ARCHIVO_HEADERS[7].keys)),
          tomo: toText(readFirstValue(row, ARCHIVO_HEADERS[3].keys)),
        });

        const container = document.createElement("div");
        container.style.position = "fixed";
        container.style.left = "-100000px";
        container.style.top = "0";
        container.style.width = "1123px";
        container.style.minHeight = "794px";
        container.style.background = "#ffffff";
        container.style.color = "#000000";
        container.style.fontFamily = "Arial, Helvetica, sans-serif";
        container.style.padding = "24px";
        container.style.boxSizing = "border-box";
        container.style.display = "flex";
        container.style.justifyContent = "center";
        container.style.alignItems = "center";
        container.innerHTML = `
          <style>
            * { color: #000 !important; -webkit-text-fill-color: #000 !important; }
            img { display: block; }
          </style>
          ${templateFilled}
        `;

        document.body.appendChild(container);

        const images = Array.from(container.querySelectorAll("img"));
        await Promise.all(
          images.map(
            (img) =>
              new Promise<void>((resolve) => {
                if (img.complete) { resolve(); return; }
                const done = () => resolve();
                img.addEventListener("load", done, { once: true });
                img.addEventListener("error", done, { once: true });
              })
          )
        );

        const canvas = await html2canvas(container, {
          scale: 3,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
          windowWidth: container.scrollWidth,
          windowHeight: container.scrollHeight,
        });

        document.body.removeChild(container);

        if (i > 0) {
          mergedPdf.addPage();
        }

        const imgData = canvas.toDataURL("image/png");
        const canvasRatio = canvas.width / canvas.height;
        let renderWidth = maxWidth;
        let renderHeight = renderWidth / canvasRatio;
        if (renderHeight > maxHeight) { renderHeight = maxHeight; renderWidth = renderHeight * canvasRatio; }
        const offsetX = (pageWidth - renderWidth) / 2;
        const offsetY = (pageHeight - renderHeight) / 2;
        mergedPdf.setFillColor(255, 255, 255);
        mergedPdf.rect(0, 0, pageWidth, pageHeight, "F");
        mergedPdf.addImage(imgData, "PNG", offsetX, offsetY, renderWidth, renderHeight, undefined, "FAST");
      }

      const stamp = new Date().toISOString().slice(0, 10);
      mergedPdf.save(`CARATULAS_PROPIEDADES_${stamp}.pdf`);
      setNotification({ message: `PDF unificado generado con ${displayedRecords.length} página(s).`, type: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setNotification({ message: `Error: ${msg}`, type: "error" });
    } finally {
      setPdfMergedLoading(false);
    }
  };

  const descargarExcel = () => {
    if (displayedRecords.length === 0) {
      setNotification({ message: "No hay datos para exportar.", type: "info" });
      return;
    }

    const exportData = displayedRecords.map((row) => {
      const exportRow: Record<string, string> = {};
      ARCHIVO_HEADERS.forEach((header) => {
        exportRow[header.label] = toText(readFirstValue(row, header.keys));
      });
      return exportRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData, {
      header: ARCHIVO_HEADERS.map((header) => header.label),
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Arch_prop");

    worksheet["!cols"] = ARCHIVO_HEADERS.map((header) => ({
      wch: header.label === "DESCRIPCIÓN" ? 80 : header.label === "SERIE/SUBSERIE_DOCUMENTAL" ? 36 : 18,
    }));

    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
    const dateColIndexes = new Set([5, 6]); // Apertura and Cierre indexes
    const thinBorder = {
      top: { style: "thin", color: { rgb: "FF000000" } },
      bottom: { style: "thin", color: { rgb: "FF000000" } },
      left: { style: "thin", color: { rgb: "FF000000" } },
      right: { style: "thin", color: { rgb: "FF000000" } },
    };

    // Style Header
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = worksheet[addr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined;
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: "FFFFFFFF" }, name: "Calibri", sz: 12 },
          fill: { fgColor: { rgb: "FF01376D" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
          border: thinBorder,
        };
      }
    }

    // Style Rows
    for (let r = 1; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[addr] as (XLSX.CellObject & { s?: Record<string, unknown>; z?: string }) | undefined;
        if (cell) {
          const originalValue = String(cell.v ?? "");
          const isDateColumn = dateColIndexes.has(c);
          const excelSerial = isDateColumn ? isoDateToExcelSerial(originalValue) : null;

          if (excelSerial !== null) {
            cell.t = "n";
            cell.v = excelSerial;
            cell.z = "yyyy-mm-dd";
          } else {
            cell.t = "s";
            cell.v = originalValue;
            cell.z = "@";
          }

          cell.s = {
            font: { name: "Calibri", sz: 11, color: { rgb: "FF000000" } },
            alignment: { horizontal: isDateColumn ? "center" : "left", vertical: "center", wrapText: true },
            border: thinBorder,
          };
        }
      }
    }

    const fileSuffix = `${filterYear || "todos"}_${filterMonth || "todos"}`;
    XLSX.writeFile(workbook, `ARCH_PROP_${fileSuffix}.xlsx`);
  };

  const [pdfAllLoading, setPdfAllLoading] = useState(false);
  const [pdfMergedLoading, setPdfMergedLoading] = useState(false);

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto gap-3 text-white overflow-hidden">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Tabs Menu */}
      <div className="flex-none flex items-center justify-between bg-slate-900/80 backdrop-blur-xl border border-cyan-500/20 px-5 py-2 rounded-2xl shadow-xl">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("ingresar")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "ingresar" ? "bg-cyan-500/20 border border-cyan-400/40 text-cyan-200" : "text-slate-400 hover:text-white"}`}
          >
            📥 Ingresar Registro
          </button>
          <button
            onClick={() => setActiveTab("consultar")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === "consultar" ? "bg-cyan-500/20 border border-cyan-400/40 text-cyan-200" : "text-slate-400 hover:text-white"}`}
          >
            🔍 Consultar / Editar
          </button>
        </div>

        {availableTemplates.length > 1 && (
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1 text-xs">
            <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Diseño Carátula:</span>
            <select
              value={selectedTemplateFilename}
              onChange={(e) => setSelectedTemplateFilename(e.target.value)}
              className="bg-transparent text-cyan-300 font-semibold focus:outline-none border-none cursor-pointer"
            >
              {availableTemplates.map((t) => (
                <option key={t.filename} value={t.filename} className="bg-slate-900 text-white">
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {activeTab === "ingresar" ? (
        <form onSubmit={handleSubmit} className="flex-1 overflow-auto bg-slate-950/70 border border-cyan-500/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black tracking-wide text-cyan-200 uppercase">FORMULARIO DE INGRESO - PROPIEDADES</h2>
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-1.5 text-xs">
              <span className="text-amber-400/80 font-bold uppercase text-[9px]">AÑO ESTABLECIDO:</span>
              <select
                value={globalYear}
                onChange={(e) => setGlobalYear(e.target.value)}
                className="bg-transparent text-amber-300 font-extrabold focus:outline-none border-none cursor-pointer"
              >
                {YEAR_OPTIONS.map((y) => <option key={y} value={y} className="bg-slate-950 text-white font-bold">{y}</option>)}
              </select>
            </div>
          </div>

          {/* Fila superior compacta */}
          <div className="flex flex-wrap items-end gap-3 border-b border-slate-800 pb-4">
            {/* Caja */}
            <div className="flex flex-col gap-1 w-20">
              <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">N° Caja</label>
              <input
                type="text"
                value={caja}
                onChange={(e) => setCaja(e.target.value)}
                placeholder="N/A"
                className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:border-cyan-400 outline-none text-center font-semibold"
              />
            </div>
            {/* Tomo */}
            <div className="flex flex-col gap-1 w-20">
              <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">N° Tomo</label>
              <input
                type="text"
                value={tomo}
                onChange={(e) => setTomo(e.target.value)}
                placeholder="1/1"
                className="bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus:border-cyan-400 outline-none text-center font-semibold"
              />
            </div>
            {/* Expediente */}
            <div className="flex flex-col gap-1 w-52 relative">
              <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">N° Expediente</label>
              <div className="flex items-center bg-slate-900 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white focus-within:border-cyan-400">
                <span className="text-slate-500 font-semibold select-none pr-0.5">I.P.0901018</span>
                <input
                  type="text"
                  maxLength={2}
                  value={expedienteYear}
                  onChange={(e) => setExpedienteYear(e.target.value.replace(/\D/g, ""))}
                  className="bg-transparent w-6 focus:outline-none font-bold text-center text-cyan-300 mr-0.5"
                />
                <input
                  type="text"
                  maxLength={6}
                  value={expedienteSeq}
                  onChange={(e) => setExpedienteSeq(e.target.value.replace(/\D/g, ""))}
                  placeholder="033423"
                  className={`bg-transparent w-full focus:outline-none font-bold ${isDuplicate ? "text-red-500" : "text-cyan-300"}`}
                />
              </div>
              {isDuplicate && (
                <span className="text-[8px] text-red-400 font-bold uppercase mt-1 absolute -bottom-3.5 right-0">⚠️ Duplicado</span>
              )}
            </div>

            {/* Fecha Apertura */}
            <div className="flex flex-col gap-1 w-64">
              <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">Fecha Apertura</label>
              <div className="grid grid-cols-3 gap-1">
                <input
                  type="text"
                  maxLength={4}
                  value={aperturaYear}
                  onChange={(e) => setAperturaYear(e.target.value.replace(/\D/g, ""))}
                  placeholder="AAAA"
                  className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 text-[11px] text-white outline-none w-full text-center font-semibold"
                />
                <select value={aperturaMonth} onChange={(e) => setAperturaMonth(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 text-[11px] text-white outline-none w-full text-center font-semibold">
                  {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.value}</option>)}
                </select>
                <input
                  type="text"
                  maxLength={2}
                  value={aperturaDay}
                  onChange={(e) => setAperturaDay(e.target.value.replace(/\D/g, ""))}
                  placeholder="DD"
                  className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 text-[11px] text-white outline-none w-full text-center font-semibold"
                />
              </div>
            </div>

            {/* Fecha Cierre */}
            <div className="flex flex-col gap-1 w-64">
              <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">Fecha Cierre</label>
              <div className="grid grid-cols-3 gap-1">
                <input
                  type="text"
                  maxLength={4}
                  value={cierreYear}
                  onChange={(e) => setCierreYear(e.target.value.replace(/\D/g, ""))}
                  placeholder="AAAA"
                  className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 text-[11px] text-white outline-none w-full text-center font-semibold"
                />
                <select value={cierreMonth} onChange={(e) => setCierreMonth(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 text-[11px] text-white outline-none w-full text-center font-semibold">
                  {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.value}</option>)}
                </select>
                <input
                  type="text"
                  maxLength={2}
                  value={cierreDay}
                  onChange={(e) => setCierreDay(e.target.value.replace(/\D/g, ""))}
                  placeholder="DD"
                  className="bg-slate-900 border border-slate-700 rounded-xl p-1.5 text-[11px] text-white outline-none w-full text-center font-semibold"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Descripción Completa */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">Diseño de la Descripción Documental</label>
              
              {/* Generador de Oficio */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-white">
                  <input
                    type="text"
                    value={descFpg}
                    onChange={(e) => setDescFpg(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-44 font-semibold text-center"
                    placeholder="Oficio No. FPG-FDACE"
                  />
                  <input
                    type="text"
                    maxLength={2}
                    value={descDigit}
                    onChange={(e) => setDescDigit(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-10 font-bold text-center text-cyan-300"
                    placeholder="3"
                  />
                  <span className="text-slate-500 font-bold">-</span>
                  <input
                    type="text"
                    maxLength={4}
                    value={descMidNums}
                    onChange={(e) => setDescMidNums(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-16 font-bold text-center text-cyan-300"
                    placeholder="6594"
                  />
                  <span className="text-slate-500 font-bold">-</span>
                  <input
                    type="text"
                    maxLength={4}
                    value={descYear}
                    onChange={(e) => setDescYear(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-16 font-bold text-center text-cyan-300"
                    placeholder="2025"
                  />
                  <span className="text-slate-500 font-bold">-</span>
                  <input
                    type="text"
                    maxLength={6}
                    value={descSeq}
                    onChange={(e) => setDescSeq(e.target.value.replace(/\D/g, ""))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 w-20 font-bold text-center text-cyan-300"
                    placeholder="000521"
                  />
                  <span className="text-slate-400 font-semibold select-none">-O</span>
                </div>

                {/* Delito Auto-Suggest */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Buscar Delito</label>
                    <input
                      type="text"
                      value={selectedDelito ? selectedDelito : delitoQuery}
                      onChange={(e) => {
                        setSelectedDelito("");
                        void fetchDelitos(e.target.value);
                      }}
                      placeholder="Escribe para buscar..."
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                    />
                    {delitoSuggestions.length > 0 && (
                      <ul className="absolute top-12 left-0 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-55 max-h-40 overflow-auto divide-y divide-slate-800">
                        {delitoSuggestions.map((item, idx) => (
                          <li
                            key={idx}
                            onClick={() => {
                              setSelectedDelito(item.DELITO);
                              setDelitoSuggestions([]);
                            }}
                            className="p-2 text-xs text-slate-200 hover:bg-cyan-500/20 hover:text-white cursor-pointer"
                          >
                            {item.DELITO}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Denunciante */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Denunciante</label>
                    <input
                      type="text"
                      value={denunciante}
                      onChange={(e) => setDenunciante(e.target.value)}
                      placeholder="Rosado Velez Sonia Marilu"
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                    />
                  </div>

                  {/* Sospechoso */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-400 uppercase">Sospechoso (Opcional)</label>
                    <input
                      type="text"
                      value={sospechoso}
                      onChange={(e) => setSospechoso(e.target.value)}
                      placeholder="Malo Carpio Bernardo"
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs focus:border-cyan-400 outline-none"
                    />
                  </div>
                </div>

                {/* Preview of Description */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 mt-2">
                  <span className="text-[9px] text-slate-500 font-bold uppercase block mb-1">Vista Previa Descripción</span>
                  <p className="text-xs text-cyan-200 font-semibold break-all leading-normal">{finalDescripcion}</p>
                </div>

                {/* Fojas & Submit Row */}
                <div className="flex items-end gap-4 mt-2 pt-2 border-t border-slate-800">
                  {/* Fojas */}
                  <div className="flex flex-col gap-1 w-24">
                    <label className="text-[9px] font-bold text-slate-400 tracking-wider uppercase">N° Fojas</label>
                    <input
                      type="text"
                      value={fojas}
                      onChange={(e) => setFojas(e.target.value.replace(/\D/g, ""))}
                      placeholder="6"
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:border-cyan-400 outline-none text-center font-bold text-cyan-300"
                    />
                  </div>
                  {/* Botón Guardar */}
                  <button
                    type="submit"
                    disabled={saving || isDuplicate}
                    className="px-6 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 font-black text-[11px] uppercase tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_12px_rgba(6,182,212,0.4)] cursor-pointer h-[32px] flex items-center justify-center"
                  >
                    {saving ? "Guardando..." : "Guardar Registro"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      ) : (
        /* ─────────────────── CONSULTING TAB ─────────────────── */
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <section className="flex-none bg-slate-950/70 border border-cyan-500/10 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
            <h2 className="text-sm font-bold tracking-wide text-cyan-200 uppercase">Consultar Archivo Propiedades</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">AÑO DE CIERRE</label>
                <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white focus:border-cyan-400 outline-none">
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">MES DE CIERRE</label>
                <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white focus:border-cyan-400 outline-none">
                  <option value="">Todos los meses</option>
                  {MONTH_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
              <button
                onClick={handleQuery}
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs tracking-wide shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all cursor-pointer disabled:opacity-50"
              >
                {loading ? "Cargando..." : "Cargar"}
              </button>
              <button
                onClick={descargarTodosPdfZip}
                disabled={pdfAllLoading || displayedRecords.length === 0}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs tracking-wide shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {pdfAllLoading ? "Generando ZIP..." : "Descargar PDFs (ZIP)"}
              </button>
              <button
                onClick={descargarTodosPdfUnificado}
                disabled={pdfMergedLoading || displayedRecords.length === 0}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold text-xs tracking-wide shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                {pdfMergedLoading ? "Generando PDF..." : "Descargar PDF Unificado"}
              </button>
              <button
                onClick={descargarExcel}
                disabled={displayedRecords.length === 0}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wide shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                Descargar Excel
              </button>
              <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
                <span className="text-slate-400 text-sm">🔍</span>
                <input
                  type="text"
                  value={searchExpediente}
                  onChange={(e) => setSearchExpediente(e.target.value)}
                  placeholder="Buscar por N° Expediente..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-white placeholder-slate-500 focus:border-cyan-400 outline-none transition-colors"
                />
              </div>
              {hasSearched && (
                <span className="text-xs font-semibold text-cyan-300">
                  Mostrando {displayedRecords.length} de {records.length} carátula(s)
                </span>
              )}
            </div>
          </section>

          {/* Table container */}
          <div className="flex-1 min-h-0 overflow-auto border border-slate-800 rounded-2xl bg-slate-950/80 shadow-2xl">
            <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
              <thead className="sticky top-0 z-10 bg-slate-900 text-cyan-300 border-b border-slate-800 font-bold uppercase tracking-wider shadow-md">
                <tr>
                  <th className="p-3 w-40 sticky left-0 z-20 bg-slate-900 border-r border-slate-800">Acciones</th>
                  {ARCHIVO_HEADERS.map((h) => (
                    <th key={h.label} className="p-3">{h.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {displayedRecords.length === 0 ? (
                  <tr>
                    <td colSpan={ARCHIVO_HEADERS.length + 1} className="p-8 text-center text-slate-500 italic font-medium">
                      {!hasSearched ? "Haz clic en 'Cargar' para ver los registros del archivo." : "No se encontraron carátulas."}
                    </td>
                  </tr>
                ) : (
                  displayedRecords.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/60 transition-colors h-10">
                      <td className="p-2 sticky left-0 z-10 bg-slate-950 border-r border-slate-800 flex gap-1">
                        <button
                          onClick={() => imprimirFilaPdf(row)}
                          className="px-2 py-1 rounded bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/40 text-[10px] font-bold cursor-pointer"
                        >
                          Imprimir
                        </button>
                        <button
                          onClick={() => openEdit(row)}
                          className="px-2 py-1 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 hover:bg-amber-500/40 text-[10px] font-bold cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="px-2 py-1 rounded bg-red-500/20 border border-red-400/40 text-red-200 hover:bg-red-500/40 text-[10px] font-bold cursor-pointer"
                        >
                          Borrar
                        </button>
                      </td>
                      {ARCHIVO_HEADERS.map((h) => {
                        const val = toText(readFirstValue(row, h.keys));
                        const isDate = h.label === "APERTURA" || h.label === "CIERRE";
                        const displayVal = isDate ? toDisplayDate(val) : val;
                        return (
                          <td
                            key={h.label}
                            className={`p-2.5 max-w-[260px] truncate ${isDate ? "text-center" : ""} ${h.label === "N°_DE_EXPEDIENTE" ? "font-bold text-cyan-300" : ""}`}
                            title={displayVal}
                          >
                            {displayVal || "-"}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/20 rounded-3xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col gap-4 text-white">
            <h3 className="text-sm font-black tracking-wide text-cyan-300 uppercase pb-2 border-b border-slate-800">
              EDITAR CARÁTULA PROP: {editExpediente}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">N° Caja</label>
                <input type="text" value={editCaja} onChange={(e) => setEditCaja(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">N° Tomo</label>
                <input type="text" value={editTomo} onChange={(e) => setEditTomo(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">N° Expediente</label>
                <input type="text" value={editExpediente} onChange={(e) => setEditExpediente(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Descripción Documental</label>
              <textarea value={editDescripcion} onChange={(e) => setEditDescripcion(e.target.value)} rows={3} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none resize-none" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Apertura (AAAA-MM-DD)</label>
                <input type="text" value={editApertura} onChange={(e) => setEditApertura(e.target.value)} placeholder="yyyy-mm-dd" className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Cierre (AAAA-MM-DD)</label>
                <input type="text" value={editCierre} onChange={(e) => setEditCierre(e.target.value)} placeholder="yyyy-mm-dd" className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">N° Fojas</label>
                <input type="text" value={editFojas} onChange={(e) => setEditFojas(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Destino Final</label>
                <input type="text" value={editDestino} onChange={(e) => setEditDestino(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Soporte</label>
                <input type="text" value={editSoporte} onChange={(e) => setEditSoporte(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Ubicación</label>
                <input type="text" value={editUbicacion} onChange={(e) => setEditUbicacion(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none" />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Observaciones</label>
              <textarea value={editObservaciones} onChange={(e) => setEditObservaciones(e.target.value)} rows={2} className="bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs focus:border-cyan-400 outline-none resize-none" />
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-800 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={handleUpdate}
                className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-xs font-black uppercase tracking-wide disabled:opacity-50 transition-all cursor-pointer"
              >
                {updating ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
