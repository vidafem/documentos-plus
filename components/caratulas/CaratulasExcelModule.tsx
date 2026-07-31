"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import Notification from "@/components/Notification";

/* ─────────────────── TYPES ─────────────────── */
type GenericRow = Record<string, unknown>;

/* ─── EXACT same header definitions as ArchivoDelegacionesModule ─── */
const ARCHIVO_HEADERS = [
  { label: "SERIE/SUBSERIE_DOCUMENTAL", keys: ["SERIE/SUBSERIE_DOCUMENTAL", "SERIE_SUBSERIE_DOCUMENTAL", "serie_subserie_documental", "SERIE /SUBSERIE DOCUMENTAL", "SERIE/SUBSERIE DOCUMENTAL"] },
  { label: "N°CAJA", keys: ["N°CAJA", "N_CAJA", "n_caja", "N° CAJA"] },
  { label: "N°_DE_EXPEDIENTE", keys: ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente", "N° DE EXPEDIENTE"] },
  { label: "N°_DE_TOMO", keys: ["N°_DE_TOMO", "N_DE_TOMO", "N_TOMO", "n_tomo", "N° DE TOMO"] },
  { label: "DESCRIPCIÓN", keys: ["DESCRIPCIÓN", "DESCRIPCION", "descripcion"] },
  { label: "APERTURA", keys: ["APERTURA", "FECHA_APERTURA", "fecha_apertura"] },
  { label: "CIERRE", keys: ["CIERRE", "FECHA_CIERRE", "fecha_cierre"] },
  { label: "N°FOJAS", keys: ["N°FOJAS", "N_FOJAS", "n_fojas", "N° FOJAS"] },
  { label: "DESTINO_FINAL", keys: ["DESTINO_FINAL", "destino_final", "DESTINO FINAL"] },
  { label: "SOPORTE", keys: ["SOPORTE", "soporte"] },
] as const;

/* ─── EXACT normalizeDateValue from ArchivoDelegacionesModule ─── */
const normalizeDateValue = (value: string): string => {
  const raw = value.trim();
  if (!raw) return "";

  const firstChunk = raw.split(" ")[0];

  // yyyy-mm-dd or yyyy/mm/dd
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

  // dd/mm/yyyy or dd-mm-yyyy
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

const toDisplayDate = (value: string): string => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return value;
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
};

const toSortableDateNumber = (value: unknown): number => {
  const normalized = normalizeDateValue(String(value ?? ""));
  if (!normalized) return 0;
  const [year, month, day] = normalized.split("-");
  return Number(`${year}${month}${day}`);
};

const getExpedienteFromRow = (row: GenericRow): string =>
  toText(readFirstValue(row, ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente", "N° DE EXPEDIENTE"]));

const getCierreFromRow = (row: GenericRow): string =>
  toText(readFirstValue(row, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));

const sortRowsByCierreAndId = (rows: GenericRow[]): GenericRow[] => {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const aDate = toSortableDateNumber(readFirstValue(a, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));
    const bDate = toSortableDateNumber(readFirstValue(b, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));
    if (aDate !== bDate) return aDate - bDate;
    const aExp = getExpedienteFromRow(a);
    const bExp = getExpedienteFromRow(b);
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

/* ─── Excel cell value → normalized ISO date string ─── */
const excelCellToIsoDate = (cell: unknown): string => {
  if (cell === undefined || cell === null) return "";

  // JS Date object (SheetJS cellDates:true)
  if (cell instanceof Date && !isNaN(cell.getTime())) {
    const y = cell.getUTCFullYear();
    const m = String(cell.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cell.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const raw = String(cell).trim();
  if (!raw) return "";

  // Try normalizeDateValue (handles yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy)
  const norm = normalizeDateValue(raw);
  if (norm) return norm;

  // Excel serial number (5+ digit integer, e.g. 44032)
  if (/^\d{5,}(\.\d+)?$/.test(raw)) {
    const serial = parseFloat(raw);
    const utcDays = Math.floor(serial - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, "0");
      const d = String(date.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // Clean garbage chars and retry (e.g. "15/=6/2020" → "15/6/2020")
  const cleaned = raw.replace(/[^0-9/.-]/g, "");
  if (cleaned && cleaned !== raw) {
    const retried = normalizeDateValue(cleaned);
    if (retried) return retried;
  }

  return "";
};

/* ────── Constants for UI ────── */
const DEFAULT_YEARS = ["2026", "2025", "2024", "2023", "2022", "2021", "2020", "2019"];
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

const buildIsoDate = (year: string, month: string, day: string): string => {
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

/* ─── Normalize Excel header → system key mapping ─── */
const normalizeExcelHeader = (header: string): string => {
  const clean = header
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

  // Check all ARCHIVO_HEADERS keys for a match
  for (const hdr of ARCHIVO_HEADERS) {
    for (const key of hdr.keys) {
      const keyClean = key
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
      if (clean === keyClean) return hdr.label;
    }
  }

  // Fuzzy matching based on keywords
  const stripped = clean.replace(/[^A-Z0-9]/g, "");
  if (stripped.includes("SERIE") && stripped.includes("SUBSERIE")) return "SERIE/SUBSERIE_DOCUMENTAL";
  if (stripped.includes("CAJA")) return "N°CAJA";
  if (stripped.includes("EXPEDIENTE")) return "N°_DE_EXPEDIENTE";
  if (stripped.includes("TOMO")) return "N°_DE_TOMO";
  if (stripped.includes("DESCRIPCION")) return "DESCRIPCIÓN";
  if (stripped === "APERTURA" || stripped.includes("APERTURA")) return "APERTURA";
  if (stripped === "CIERRE" || stripped.includes("CIERRE")) return "CIERRE";
  if (stripped.includes("FOJAS")) return "N°FOJAS";
  if (stripped.includes("DESTINO")) return "DESTINO_FINAL";
  if (stripped.includes("SOPORTE")) return "SOPORTE";

  return header.trim();
};

/* ═══════════════════ COMPONENT ═══════════════════ */
export default function CaratulasExcelModule() {
  const [allRows, setAllRows] = useState<GenericRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<GenericRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [yearOptions, setYearOptions] = useState<string[]>(DEFAULT_YEARS);
  const [inicioYear, setInicioYear] = useState("2026");
  const [inicioMonth, setInicioMonth] = useState("01");
  const [inicioDay, setInicioDay] = useState("01");
  const [finYear, setFinYear] = useState("2026");
  const [finMonth, setFinMonth] = useState("12");
  const [finDay, setFinDay] = useState("31");

  const [filtroAplicado, setFiltroAplicado] = useState(false);
  const [pdfTemplate, setPdfTemplate] = useState("");
  const [pdfAllLoading, setPdfAllLoading] = useState(false);
  const [pdfMergedLoading, setPdfMergedLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [searchExpediente, setSearchExpediente] = useState("");

  const [availableTemplates, setAvailableTemplates] = useState<{ filename: string; displayName: string }[]>([]);
  const [selectedTemplateFilename, setSelectedTemplateFilename] = useState("formato_delegaciones.html");

  // Fetch available templates list on mount
  useEffect(() => {
    let active = true;
    const fetchTemplatesList = async () => {
      try {
        console.log("[CARATULAS] Buscando plantillas disponibles...");
        const res = await fetch("/api/formatos");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        console.log("[CARATULAS] Plantillas encontradas:", data.templates);
        if (active && data.templates) {
          setAvailableTemplates(data.templates);
          const hasDefault = data.templates.some(
            (t: { filename: string; displayName: string }) => t.filename === "formato_delegaciones.html"
          );
          if (!hasDefault && data.templates.length > 0) {
            console.log("[CARATULAS] Plantilla default no encontrada, usando:", data.templates[0].filename);
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

  // Load PDF template HTML dynamically when selected filename changes
  useEffect(() => {
    let active = true;
    const loadTemplate = async () => {
      try {
        console.log("[CARATULAS] Intentando cargar archivo de plantilla:", selectedTemplateFilename);
        const response = await fetch(`/formatos/${selectedTemplateFilename}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        console.log(`[CARATULAS] Plantilla "${selectedTemplateFilename}" cargada. Largo original:`, html.length);
        const normalized = normalizePdfTemplateHtml(html);
        console.log(`[CARATULAS] Plantilla normalizada. Largo:`, normalized.length);
        if (active) setPdfTemplate(normalized);
      } catch (error) {
        console.error("[CARATULAS] Error al cargar la plantilla:", error);
        if (active) {
          const msg = error instanceof Error ? error.message : "Error desconocido";
          setNotification({ message: `No se pudo cargar la plantilla ${selectedTemplateFilename}: ${msg}`, type: "error" });
        }
      }
    };
    void loadTemplate();
    return () => { active = false; };
  }, [selectedTemplateFilename]);

  /* ─── Excel File Upload & Parsing ─── */
  const handleFileUpload = (file: File) => {
    if (!file) return;

    const isExcel = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!isExcel) {
      setNotification({ message: "Por favor selecciona un archivo Excel (.xlsx, .xls) válido.", type: "error" });
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        console.log("[CARATULAS] ═══ INICIO PROCESAMIENTO EXCEL ═══");
        console.log("[CARATULAS] Archivo:", file.name, "| Tamaño:", file.size, "bytes");

        const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        console.log("[CARATULAS] Hoja seleccionada:", sheetName);
        console.log("[CARATULAS] Todas las hojas:", workbook.SheetNames);

        // Read as 2D array with raw values preserved
        const raw2D = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "" });
        console.log("[CARATULAS] Total filas leídas del Excel:", raw2D?.length);

        if (!raw2D || raw2D.length < 2) {
          console.error("[CARATULAS] ❌ Archivo vacío o con menos de 2 filas");
          setNotification({ message: "El archivo Excel está vacío.", type: "error" });
          return;
        }

        // Log first 10 rows raw for debugging
        console.log("[CARATULAS] ─── Primeras 10 filas RAW del Excel ───");
        for (let r = 0; r < Math.min(10, raw2D.length); r++) {
          console.log(`[CARATULAS] Fila ${r}:`, raw2D[r]);
        }

        // Find the actual header row (first row that has ≥3 recognizable column names)
        console.log("[CARATULAS] ─── Buscando fila de encabezados ───");
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(15, raw2D.length); r++) {
          const rowArr = raw2D[r] as unknown[];
          if (!rowArr) continue;
          let matchCount = 0;
          const matchDetails: string[] = [];
          for (const cell of rowArr) {
            const cellStr = String(cell ?? "");
            const normalized = normalizeExcelHeader(cellStr);
            const isKnown = ARCHIVO_HEADERS.some((h) => h.label === normalized);
            if (isKnown) {
              matchCount++;
              matchDetails.push(`"${cellStr}" → ${normalized}`);
            }
          }
          console.log(`[CARATULAS] Fila ${r}: ${matchCount} columnas reconocidas`, matchCount > 0 ? matchDetails : "");
          if (matchCount >= 3) {
            headerRowIdx = r;
            console.log(`[CARATULAS] ✅ Fila de encabezados encontrada en fila ${r} con ${matchCount} matches`);
            break;
          }
        }

        if (headerRowIdx === -1) {
          console.error("[CARATULAS] ❌ No se encontró fila de encabezados. Ninguna fila tiene ≥3 columnas reconocidas.");
          console.error("[CARATULAS] Columnas del sistema esperadas:", ARCHIVO_HEADERS.map(h => h.label));
          setNotification({ message: "No se encontró una fila de encabezados reconocible. Asegúrate que el archivo tiene columnas como N° DE EXPEDIENTE, DESCRIPCIÓN, APERTURA, CIERRE.", type: "error" });
          return;
        }

        // Build column index → system label mapping
        const headerRow = raw2D[headerRowIdx] as unknown[];
        const colMapping: { idx: number; label: string }[] = [];
        console.log("[CARATULAS] ─── Mapeo de columnas Excel → Sistema ───");
        for (let c = 0; c < headerRow.length; c++) {
          const originalHeader = String(headerRow[c] ?? "").trim();
          if (!originalHeader) continue;
          const label = normalizeExcelHeader(originalHeader);
          console.log(`[CARATULAS] Columna ${c}: "${originalHeader}" → "${label}"${label !== originalHeader ? " ✅ MAPEADA" : " ⚠️ SIN MAPEO"}`);
          colMapping.push({ idx: c, label });
        }
        console.log("[CARATULAS] Total columnas mapeadas:", colMapping.length);

        // Parse data rows into GenericRow objects with normalized keys
        const parsedRows: GenericRow[] = [];
        const detectedYears = new Set<string>();

        let skippedEmpty = 0;
        let skippedNoData = 0;

        for (let r = headerRowIdx + 1; r < raw2D.length; r++) {
          const rowArr = raw2D[r] as unknown[];
          if (!rowArr) continue;

          // Skip completely empty rows
          const hasContent = rowArr.some((c) => String(c ?? "").trim().length > 0);
          if (!hasContent) { skippedEmpty++; continue; }

          const row: GenericRow = {};
          for (const col of colMapping) {
            const cellValue = rowArr[col.idx];

            // For date columns, normalize to ISO string
            if (col.label === "APERTURA" || col.label === "CIERRE") {
              const isoDate = excelCellToIsoDate(cellValue);
              row[col.label] = isoDate;
              // Log first 5 date conversions for debugging
              if (parsedRows.length < 5) {
                console.log(`[CARATULAS] Fila ${r} | ${col.label}: raw="${cellValue}" (type=${typeof cellValue}, isDate=${cellValue instanceof Date}) → iso="${isoDate}"`);
              }
            } else {
              row[col.label] = toText(cellValue);
            }
          }

          // Validate: must have at least an expediente or descripción to be real data
          const expediente = readFirstValue(row, ARCHIVO_HEADERS[2].keys);
          const descripcion = readFirstValue(row, ARCHIVO_HEADERS[4].keys);
          if (!expediente && !descripcion) { skippedNoData++; continue; }

          // Log first 3 parsed rows for debugging
          if (parsedRows.length < 3) {
            console.log(`[CARATULAS] ─── Fila ${r} parseada ───`, JSON.stringify(row, null, 2));
          }

          // Collect years for auto-range (ONLY from CIERRE)
          const cierreIso = toText(row["CIERRE"]);
          if (cierreIso.length >= 4) detectedYears.add(cierreIso.slice(0, 4));

          parsedRows.push(row);
        }

        console.log(`[CARATULAS] ─── Resumen de procesamiento ───`);
        console.log(`[CARATULAS] Filas válidas: ${parsedRows.length}`);
        console.log(`[CARATULAS] Filas vacías ignoradas: ${skippedEmpty}`);
        console.log(`[CARATULAS] Filas sin expediente/descripción: ${skippedNoData}`);
        console.log(`[CARATULAS] Años detectados: [${Array.from(detectedYears).join(", ")}]`);

        if (parsedRows.length === 0) {
          setNotification({ message: "No se encontraron filas de datos válidas en el archivo.", type: "error" });
          return;
        }

        const sorted = sortRowsByCierreAndId(parsedRows);

        // Auto-configure year options — ONLY from data, no defaults
        const sortedYears = Array.from(detectedYears).sort((a, b) => Number(b) - Number(a));
        const finalYears = sortedYears.length > 0 ? sortedYears : [String(new Date().getFullYear())];
        setYearOptions(finalYears);

        // Auto-detect date range from data (ONLY CIERRE)
        let earliestDate = "";
        let latestDate = "";
        for (const row of sorted) {
          const d = toText(row["CIERRE"]);
          if (!d) continue;
          if (!earliestDate || d < earliestDate) earliestDate = d;
          if (!latestDate || d > latestDate) latestDate = d;
        }

        console.log(`[CARATULAS] Rango de fechas detectado: ${earliestDate} → ${latestDate}`);

        if (earliestDate && latestDate) {
          const [eY, eM, eD] = earliestDate.split("-");
          const [lY, lM, lD] = latestDate.split("-");
          console.log(`[CARATULAS] Selector INICIO: ${eY}/${eM}/${eD} | FIN: ${lY}/${lM}/${lD}`);
          if (eY && eM && eD) { setInicioYear(eY); setInicioMonth(eM); setInicioDay(eD); }
          if (lY && lM && lD) { setFinYear(lY); setFinMonth(lM); setFinDay(lD); }
        } else {
          console.warn("[CARATULAS] ⚠️ No se detectaron fechas válidas en los datos");
        }

        setAllRows(sorted);
        setFilteredRows(sorted);
        setFiltroAplicado(true);
        setNotification({
          message: `¡Excel cargado! ${sorted.length} registros procesados correctamente.`,
          type: "success"
        });
        console.log("[CARATULAS] ═══ FIN PROCESAMIENTO EXCEL ═══");
      } catch (err) {
        console.error("[CARATULAS] ❌ ERROR FATAL:", err);
        const msg = err instanceof Error ? err.message : "Error al procesar el archivo.";
        setNotification({ message: msg, type: "error" });
      }
    };

    reader.readAsArrayBuffer(file);
  };

  /* ─── Filtering ─── */
  const fechaInicioIso = useMemo(() => buildIsoDate(inicioYear, inicioMonth, inicioDay), [inicioYear, inicioMonth, inicioDay]);
  const fechaFinIso = useMemo(() => buildIsoDate(finYear, finMonth, finDay), [finYear, finMonth, finDay]);

  /* ─── Search filter on top of date filter ─── */
  const displayRows = useMemo(() => {
    if (!searchExpediente.trim()) return filteredRows;
    const term = searchExpediente.trim().toUpperCase();
    return filteredRows.filter((row) => {
      const exp = getExpedienteFromRow(row).toUpperCase();
      return exp.includes(term);
    });
  }, [filteredRows, searchExpediente]);

  const aplicarFiltro = useCallback(() => {
    if (allRows.length === 0) {
      setNotification({ message: "Primero debes cargar un archivo Excel.", type: "info" });
      return;
    }

    if (!fechaInicioIso || !fechaFinIso) {
      setNotification({ message: "Selecciona fecha de inicio y fin.", type: "error" });
      return;
    }

    if (fechaInicioIso > fechaFinIso) {
      setNotification({ message: "La fecha de inicio no puede ser posterior a la fecha fin.", type: "error" });
      return;
    }

    const res = allRows.filter((row) => {
      const cierreVal = toText(row["CIERRE"]);
      if (!cierreVal) return true;
      return cierreVal >= fechaInicioIso && cierreVal <= fechaFinIso;
    });

    setFilteredRows(res);
    setFiltroAplicado(true);
    setNotification({
      message: `Filtro aplicado: ${res.length} de ${allRows.length} registros.`,
      type: "success"
    });
  }, [allRows, fechaInicioIso, fechaFinIso]);

  /* ─── Clear cache ─── */
  const limpiarCache = () => {
    setAllRows([]);
    setFilteredRows([]);
    setFileName("");
    setSearchExpediente("");
    setFiltroAplicado(false);
    setInicioYear("2026");
    setInicioMonth("01");
    setInicioDay("01");
    setFinYear("2026");
    setFinMonth("12");
    setFinDay("31");
    setYearOptions(DEFAULT_YEARS);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setNotification({ message: "Cache limpiada. Puedes cargar un nuevo archivo.", type: "info" });
  };

  /* ─── PDF Generation (EXACT copy from ArchivoDelegacionesModule) ─── */
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

  const descargarTodosPdfZip = async () => {
    if (filteredRows.length === 0) {
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
      for (let i = 0; i < filteredRows.length; i++) {
        const row = filteredRows[i];
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
      a.download = `CARATULAS_DELEGACIONES_${stamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setNotification({ message: `Se generaron ${filteredRows.length} PDFs en ZIP.`, type: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setNotification({ message: `Error: ${msg}`, type: "error" });
    } finally {
      setPdfAllLoading(false);
    }
  };

  const descargarTodosPdfUnificado = async () => {
    if (filteredRows.length === 0) {
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

      for (let i = 0; i < filteredRows.length; i++) {
        const row = filteredRows[i];
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
        container.innerHTML = `<style>* { color: #000 !important; -webkit-text-fill-color: #000 !important; } img { display: block; }</style>${templateFilled}`;
        document.body.appendChild(container);

        const images = Array.from(container.querySelectorAll("img"));
        await Promise.all(images.map((img) => new Promise<void>((resolve) => { if (img.complete) { resolve(); return; } const done = () => resolve(); img.addEventListener("load", done, { once: true }); img.addEventListener("error", done, { once: true }); })));

        const canvas = await html2canvas(container, { scale: 3, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: container.scrollWidth, windowHeight: container.scrollHeight });
        document.body.removeChild(container);

        if (i > 0) mergedPdf.addPage();
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
      mergedPdf.save(`CARATULAS_DELEGACIONES_${stamp}.pdf`);
      setNotification({ message: `PDF unificado generado con ${filteredRows.length} página(s).`, type: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setNotification({ message: `Error: ${msg}`, type: "error" });
    } finally {
      setPdfMergedLoading(false);
    }
  };

  /* ═══════════════════ RENDER ═══════════════════ */
  return (
    <div className="flex flex-col h-full w-full max-w-7xl mx-auto gap-3 text-white overflow-hidden">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => {
          if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
        }}
        className="hidden"
      />

      {/* Header */}
      <header className="flex-none flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/80 backdrop-blur-xl border border-cyan-500/20 px-5 py-3 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold tracking-wider text-cyan-300">CARÁTULAS DELEGACIONES</h1>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/30 text-xs font-bold transition-all shadow-md cursor-pointer"
            title="Cargar archivo Excel"
          >
            <span>📁</span>
            <span>{fileName ? "Cambiar Excel" : "Cargar Excel"}</span>
          </button>
          <a
            href="/formatos/formats.xlsx"
            download="formats.xlsx"
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/30 text-xs font-bold transition-all shadow-md cursor-pointer no-underline"
            title="Descargar formato Excel"
          >
            <span>📥</span>
            <span>Descargar formato</span>
          </a>
          <button
            onClick={limpiarCache}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-red-500/20 border border-red-400/40 text-red-200 hover:bg-red-500/30 text-xs font-bold transition-all shadow-md cursor-pointer"
            title="Borrar cache y datos cargados"
          >
            <span>🗑️</span>
            <span>Limpiar</span>
          </button>
          {availableTemplates.length > 1 && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs">
              <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider">Diseño:</span>
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
        {fileName && (
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-400/30 rounded-xl text-xs text-emerald-200 font-semibold">
            <span>✅ {fileName} ({allRows.length} filas)</span>
          </div>
        )}
      </header>

      {/* Filters */}
      <section className="flex-none bg-slate-950/70 backdrop-blur-2xl border border-cyan-500/20 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
        <h2 className="text-sm font-bold tracking-wide text-cyan-200 uppercase">ARCHIVO TOTAL</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">FECHA INICIO</label>
            <div className="grid grid-cols-3 gap-2">
              <select value={inicioYear} onChange={(e) => setInicioYear(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white focus:border-cyan-400 outline-none">
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={inicioMonth} onChange={(e) => setInicioMonth(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white focus:border-cyan-400 outline-none">
                {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={inicioDay} onChange={(e) => setInicioDay(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white focus:border-cyan-400 outline-none">
                {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-300 tracking-wider uppercase">FECHA FIN</label>
            <div className="grid grid-cols-3 gap-2">
              <select value={finYear} onChange={(e) => setFinYear(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white focus:border-cyan-400 outline-none">
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <select value={finMonth} onChange={(e) => setFinMonth(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white focus:border-cyan-400 outline-none">
                {MONTH_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={finDay} onChange={(e) => setFinDay(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-xl p-2 text-xs font-semibold text-white focus:border-cyan-400 outline-none">
                {DAY_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3">
          <button onClick={aplicarFiltro} className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs tracking-wide shadow-[0_0_12px_rgba(6,182,212,0.4)] transition-all cursor-pointer">
            Filtrar
          </button>
          <button
            onClick={descargarTodosPdfZip}
            disabled={pdfAllLoading || displayRows.length === 0}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs tracking-wide shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
          >
            {pdfAllLoading ? "Generando ZIP..." : "Descargar todos los PDF (ZIP)"}
          </button>
          <button
            onClick={descargarTodosPdfUnificado}
            disabled={pdfMergedLoading || displayRows.length === 0}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold text-xs tracking-wide shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
          >
            {pdfMergedLoading ? "Generando PDF..." : "Descargar PDF Unificado"}
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
          {filtroAplicado && (
            <span className="text-xs font-semibold text-cyan-300">
              Mostrando {displayRows.length} de {filteredRows.length} carátula(s)
            </span>
          )}
        </div>
      </section>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto border border-slate-800 rounded-2xl bg-slate-950/80 shadow-2xl">
        <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
          <thead className="sticky top-0 z-10 bg-slate-900 text-cyan-300 border-b border-slate-800 font-bold uppercase tracking-wider shadow-md">
            <tr>
              <th className="p-3 w-28 sticky left-0 z-20 bg-slate-900 border-r border-slate-800">PDF</th>
              {ARCHIVO_HEADERS.map((h) => (
                <th key={h.label} className="p-3">{h.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={ARCHIVO_HEADERS.length + 1} className="p-8 text-center text-slate-500 italic font-medium">
                  {allRows.length === 0
                    ? "Haz clic en '📁 Cargar Excel' para cargar tu archivo."
                    : searchExpediente.trim()
                      ? `No se encontraron expedientes que coincidan con "${searchExpediente}".`
                      : "No se encontraron registros en el rango de fechas seleccionado."}
                </td>
              </tr>
            ) : (
              displayRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-900/60 transition-colors h-10">
                  <td className="p-2.5 sticky left-0 z-10 bg-slate-950 border-r border-slate-800">
                    <button
                      onClick={() => imprimirFilaPdf(row)}
                      className="px-2.5 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/40 font-bold text-[11px] transition-all cursor-pointer w-full text-center"
                    >
                      Imprimir PDF
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
  );
}
