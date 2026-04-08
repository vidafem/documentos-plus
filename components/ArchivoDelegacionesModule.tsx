"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

type ArchivoOption = "archivo_por_mes" | "archivo_total";
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

const ARCH_DELE_INSERT_COLUMNS = [
  "SERIE/SUBSERIE_DOCUMENTAL",
  "N°CAJA",
  "N°_DE_EXPEDIENTE",
  "N°_DE_TOMO",
  "DESCRIPCIÓN",
  "APERTURA",
  "CIERRE",
  "N°FOJAS",
  "DESTINO_FINAL",
  "SOPORTE",
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

const extractFiscalNumber = (value: unknown): string => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const matches = text.match(/\d+/g);
  return matches && matches.length > 0 ? matches[matches.length - 1] : "";
};

const extractOfficioSixDigits = (value: unknown): string => {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "000000";
  return digits.slice(-6).padStart(6, "0");
};

const normalizeLookupKey = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const buildFiscalKey = (fiscal: unknown, numfis: unknown): string =>
  `${normalizeLookupKey(fiscal)}|${String(numfis ?? "").trim()}`;

const toTitleCase = (value: unknown): string => {
  const cleaned = String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return cleaned
    .split(" ")
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1)}` : ""))
    .join(" ");
};

const getYear = (value: unknown): string => {
  const normalized = normalizeDateValue(String(value ?? ""));
  if (!normalized) return "";
  return normalized.split("-")[0] || "";
};

const sospechosoLabel = (value: unknown): "Sospechoso" | "Sospechosos" => {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
  return words.length > 4 ? "Sospechosos" : "Sospechoso";
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

const mapFlagranciaToArchDele = (row: GenericRow, fiscalCodByKey: Map<string, string>): Record<string, string | number | null> => {
  const result: Record<string, string | number | null> = {};

  const ifValue = toText(row["IF"]);
  const unidadFiscalia = toText(row["UNIDAD_ESPECIALIZADA_DE_FISCALIA"]);
  const numFiscalia = extractFiscalNumber(unidadFiscalia);
  const fiscalName = toText(row["APELLIDOS_Y_NOMBRES_DEL_FISCAL"]);
  const fiscalCod = fiscalCodByKey.get(buildFiscalKey(fiscalName, numFiscalia)) || "NFISCAL";
  const anioDelegacion = getYear(row["F_DELEGACION"]);
  const oficio6 = extractOfficioSixDigits(row["Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE"]);

  const delito = toText(row["DELITO_DESAGREGACION_POLICIA_JUDICIAL"]);
  const detenidoRaw = toText(row["DETENIDO"]);
  const detenidoTitleCase = toTitleCase(detenidoRaw);
  const sospechosoTexto = `${sospechosoLabel(detenidoRaw)}: ${detenidoTitleCase}.`;

  result["SERIE/SUBSERIE_DOCUMENTAL"] = "Procedimientos Investigativos por Disposición Judicial";
  result["N°CAJA"] = "";
  result["N°_DE_EXPEDIENTE"] = `IF-${ifValue}`;
  result["N°_DE_TOMO"] = "";
  result["DESCRIPCIÓN"] = `Oficio No.FPG-FEIFO${numFiscalia}-${fiscalCod}-${anioDelegacion}-${oficio6}-O; Delito: ${delito} ; ${sospechosoTexto}`;
  result["APERTURA"] = toNullableDateIso(row["F_DELEGACION"]);
  result["CIERRE"] = toNullableDateIso(row["EXTRACTO"]);
  result["N°FOJAS"] = toNullableInteger(row["FOJAS"]);
  result["DESTINO_FINAL"] = "Eliminación";
  result["SOPORTE"] = "Fisico";

  return result;
};

const normalizeDateValue = (value: string): string => {
  const raw = value.trim();
  if (!raw) return "";

  // Soporta: yyyy-mm-dd, yyyy/mm/dd, dd/mm/yyyy y fechas con hora.
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

const toSortableDateNumber = (value: unknown): number => {
  const normalized = normalizeDateValue(String(value ?? ""));
  if (!normalized) return 0;
  const [year, month, day] = normalized.split("-");
  return Number(`${year}${month}${day}`);
};

const formatDateIso = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
};

const getMonthDateRange = (year: string, month: string): { start: string; end: string; nextMonthStart: string } | null => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const startDate = new Date(y, m - 1, 1);
  const endDate = new Date(y, m, 0);
  const nextMonthDate = new Date(y, m, 1);
  return { start: formatDateIso(startDate), end: formatDateIso(endDate), nextMonthStart: formatDateIso(nextMonthDate) };
};

const sanitizeFileName = (value: string): string => value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();

const encodeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const replaceTemplateTokens = (template: string, values: Record<string, string>): string => {
  let html = template;

  html = html.replace(/\{\{\s*DESCRIPCION\s*\}\}/g, encodeHtml(values.descripcion));
  html = html.replace(/\{\{\s*N(?:°|&deg;)\s*DE\s*EXPEDIENTE\s*\}\}/g, encodeHtml(values.expediente));
  html = html.replace(/\{\{\s*APERTURA\s*\}\}/g, encodeHtml(values.apertura));
  html = html.replace(/\{\{\s*CIERRE\s*\}\}/g, encodeHtml(values.cierre));
  html = html.replace(/\{\{\s*N(?:°|&deg;)\s*FOJAS\s*\}\}/g, encodeHtml(values.fojas));
  html = html.replace(/\{\{\s*N(?:°|&deg;)\s*DE\s*TOMO\s*\}\}/g, encodeHtml(values.tomo));

  return html;
};

const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

const getExpedienteFromRow = (row: GenericRow): string =>
  toText(readFirstValue(row, ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente"]));

const getCierreFromRow = (row: GenericRow): string =>
  toText(readFirstValue(row, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));

const getPdfNameBase = (row: GenericRow): string => {
  const expediente = getExpedienteFromRow(row) || "SIN_EXPEDIENTE";
  const cierre = getCierreFromRow(row) || "SIN_CIERRE";
  return sanitizeFileName(`${expediente}_${cierre}`);
};

const buildArchCompositeKey = (expediente: unknown, cierre: unknown): string => {
  const exp = String(expediente ?? "").trim();
  const cierreNorm = normalizeDateValue(String(cierre ?? ""));
  const ym = cierreNorm ? cierreNorm.slice(0, 7) : "";
  return exp && ym ? `${exp}|${ym}` : "";
};

const buildArchExpedienteKey = (expediente: unknown): string =>
  String(expediente ?? "").trim();

const sortRowsByCierreAndId = (rows: GenericRow[]): GenericRow[] => {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const aDate = toSortableDateNumber(readFirstValue(a, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));
    const bDate = toSortableDateNumber(readFirstValue(b, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"]));
    if (aDate !== bDate) return aDate - bDate;

    const aId = Number(a.id ?? 0);
    const bId = Number(b.id ?? 0);
    if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;

    const aExp = getExpedienteFromRow(a);
    const bExp = getExpedienteFromRow(b);
    return aExp.localeCompare(bExp);
  });
  return sorted;
};

export const syncArchDeleFromFlagranciaGlobal = async (): Promise<{
  dedupedCount: number;
  skippedDuplicates: number;
  omittedWithoutDates: number;
}> => {
  const { data: fiscalData, error: fiscalError } = await supabase
    .from("fiscal")
    .select("FISCAL, NUMFIS, COD");

  if (fiscalError) {
    throw new Error(`No se pudo leer fiscal: ${fiscalError.message}`);
  }

  const fiscalCodByKey = new Map<string, string>();
  ((fiscalData || []) as GenericRow[]).forEach((item) => {
    const fiscal = toText(item["FISCAL"]);
    const numfis = extractFiscalNumber(item["NUMFIS"]);
    const cod = toText(item["COD"]).replace(/\D/g, "").slice(-4).padStart(4, "0");
    if (fiscal && numfis) {
      fiscalCodByKey.set(buildFiscalKey(fiscal, numfis), cod || "NFISCAL");
    }
  });

  const PAGE_SIZE = 1000;
  let from = 0;
  const flagranciaRows: GenericRow[] = [];

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data: flagranciaData, error: flagranciaError } = await supabase
      .from("FLAGRANCIA")
      .select("*")
      .order("id", { ascending: true })
      .range(from, to);

    if (flagranciaError) {
      throw new Error(`No se pudo leer FLAGRANCIA: ${flagranciaError.message}`);
    }

    const chunk = (flagranciaData || []) as GenericRow[];
    flagranciaRows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const payload = flagranciaRows
    .map((row) => {
      const mapped = mapFlagranciaToArchDele(row, fiscalCodByKey);
      const insertRow: Record<string, string | number | null> = {};
      ARCH_DELE_INSERT_COLUMNS.forEach((column) => {
        const value = mapped[column];
        insertRow[column] = value === undefined ? null : value;
      });
      return insertRow;
    })
    .filter((row) => Boolean(row["APERTURA"]) && Boolean(row["CIERRE"]));

  const uniqueByExpediente = new Map<string, Record<string, string | number | null>>();
  payload.forEach((row) => {
    const expedienteKey = String(row["N°_DE_EXPEDIENTE"] || "").trim();
    if (!expedienteKey) return;

    // Clave compuesta: mismo IF en distintos meses = entradas separadas en el archivo
    const cierreStr = String(row["CIERRE"] || "");
    const cierreYearMonth = cierreStr.slice(0, 7); // "yyyy-mm"
    const compositeKey = `${expedienteKey}|${cierreYearMonth}`;

    const current = uniqueByExpediente.get(compositeKey);
    if (!current) {
      uniqueByExpediente.set(compositeKey, row);
      return;
    }

    // Dentro del mismo mes, quedarse con el de CIERRE más reciente
    const currentCierre = toSortableDateNumber(current["CIERRE"]);
    const candidateCierre = toSortableDateNumber(row["CIERRE"]);
    if (candidateCierre >= currentCierre) {
      uniqueByExpediente.set(compositeKey, row);
    }
  });
  const dedupedPayload = Array.from(uniqueByExpediente.values());

  const existingManualValuesByComposite = new Map<string, { caja: string; tomo: string }>();
  const existingManualValuesByExpediente = new Map<string, { caja: string; tomo: string }>();
  const existingRowsByComposite = new Map<string, GenericRow>();
  {
    const PAGE_SIZE_EXISTING = 1000;
    let fromExisting = 0;
    while (true) {
      const toExisting = fromExisting + PAGE_SIZE_EXISTING - 1;
      const { data: existingData, error: existingError } = await supabase
        .from("Arch_dele")
        .select("*")
        .order("id", { ascending: true })
        .range(fromExisting, toExisting);

      if (existingError) {
        throw new Error(`No se pudo leer Arch_dele existente: ${existingError.message}`);
      }

      const chunk = (existingData || []) as GenericRow[];
      chunk.forEach((row) => {
        const expediente = readFirstValue(row, ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente"]);
        const key = buildArchCompositeKey(
          expediente,
          readFirstValue(row, ["CIERRE", "FECHA_CIERRE", "fecha_cierre"])
        );
        const caja = toText(readFirstValue(row, ["N°CAJA", "N_CAJA", "n_caja"]));
        const tomo = toText(readFirstValue(row, ["N°_DE_TOMO", "N_DE_TOMO", "N_TOMO", "n_tomo"]));

        if (key) {
          existingManualValuesByComposite.set(key, { caja, tomo });
          existingRowsByComposite.set(key, row);
        }

        const expKey = buildArchExpedienteKey(expediente);
        if (expKey && !existingManualValuesByExpediente.has(expKey)) {
          existingManualValuesByExpediente.set(expKey, { caja, tomo });
        }
      });

      if (chunk.length < PAGE_SIZE_EXISTING) break;
      fromExisting += PAGE_SIZE_EXISTING;
    }
  }

  const mergedPayload = dedupedPayload.map((row) => {
    const key = buildArchCompositeKey(row["N°_DE_EXPEDIENTE"], row["CIERRE"]);
    const expKey = buildArchExpedienteKey(row["N°_DE_EXPEDIENTE"]);
    const existing = (key ? existingManualValuesByComposite.get(key) : undefined)
      || (expKey ? existingManualValuesByExpediente.get(expKey) : undefined);
    if (!existing) return row;

    const merged = { ...row };
    const currentCaja = toText(merged["N°CAJA"]);
    const currentTomo = toText(merged["N°_DE_TOMO"]);

    if (!currentCaja && existing.caja) merged["N°CAJA"] = existing.caja;
    if (!currentTomo && existing.tomo) merged["N°_DE_TOMO"] = existing.tomo;

    return merged;
  });

  const incomingKeys = new Set(
    mergedPayload
      .map((row) => buildArchCompositeKey(row["N°_DE_EXPEDIENTE"], row["CIERRE"]))
      .filter(Boolean)
  );

  const carriedExistingRows: Record<string, string | number | null>[] = [];
  existingRowsByComposite.forEach((row, key) => {
    if (incomingKeys.has(key)) return;
    const carried: Record<string, string | number | null> = {};
    ARCH_DELE_INSERT_COLUMNS.forEach((column) => {
      carried[column] = toText(readFirstValue(row, [column])) || null;
    });
    carriedExistingRows.push(carried);
  });

  const finalPayload = [...mergedPayload, ...carriedExistingRows];

  const { error: clearNotNullError } = await supabase
    .from("Arch_dele")
    .delete()
    .not("SOPORTE", "is", null);

  if (clearNotNullError) {
    throw new Error(`No se pudo limpiar Arch_dele: ${clearNotNullError.message}`);
  }

  const { error: clearNullError } = await supabase
    .from("Arch_dele")
    .delete()
    .is("SOPORTE", null);

  if (clearNullError) {
    throw new Error(`No se pudo limpiar Arch_dele: ${clearNullError.message}`);
  }

  if (finalPayload.length > 0) {
    for (let i = 0; i < finalPayload.length; i += 500) {
      const slice = finalPayload.slice(i, i + 500);
      const { error: insertError } = await supabase
        .from("Arch_dele")
        .insert(slice);

      if (insertError) {
        throw new Error(`No se pudo actualizar Arch_dele: ${insertError.message}`);
      }
    }
  }

  return {
    dedupedCount: finalPayload.length,
    skippedDuplicates: payload.length - dedupedPayload.length,
    omittedWithoutDates: flagranciaRows.length - payload.length,
  };
};

export default function ArchivoDelegacionesModule() {
  const [activeOption, setActiveOption] = useState<ArchivoOption>("archivo_por_mes");
  const [registrosMesBase, setRegistrosMesBase] = useState<GenericRow[]>([]);
  const [registrosTotal, setRegistrosTotal] = useState<GenericRow[]>([]);
  const [loadingMes, setLoadingMes] = useState(false);
  const [loadingTotal, setLoadingTotal] = useState(false);
  const [filtroAplicadoMes, setFiltroAplicadoMes] = useState(false);
  const [filtroAplicadoTotal, setFiltroAplicadoTotal] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "error" | "info" | "success" } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const [mesFiltro, setMesFiltro] = useState("");
  const [anioFiltro, setAnioFiltro] = useState("");
  const [campoMasivoMes, setCampoMasivoMes] = useState<"N°CAJA" | "N°_DE_TOMO">("N°CAJA");
  const [valorMasivoMes, setValorMasivoMes] = useState("");
  const [guardandoMasivoMes, setGuardandoMasivoMes] = useState(false);
  const [filaInicioMes, setFilaInicioMes] = useState("1");
  const [filaFinMes, setFilaFinMes] = useState("");
  const maxFojasMes = "400";  // Máximo de fojas permitidas por caja

  const [fechaInicioTotal, setFechaInicioTotal] = useState("");
  const [fechaFinTotal, setFechaFinTotal] = useState("");
  const [pdfTemplate, setPdfTemplate] = useState("");
  const [pdfRowBusyKey, setPdfRowBusyKey] = useState("");
  const [pdfAllLoading, setPdfAllLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const loadTemplate = async () => {
      try {
        const response = await fetch("/formatos/formato_delegaciones.html", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const html = await response.text();
        if (active) {
          setPdfTemplate(html);
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

  const createPdfBlobForRow = async (row: GenericRow): Promise<Blob> => {
    if (!pdfTemplate) {
      throw new Error("La plantilla HTML aún no se cargó.");
    }

    const templateFilled = replaceTemplateTokens(pdfTemplate, {
      descripcion: toText(readFirstValue(row, ["DESCRIPCIÓN", "DESCRIPCION", "descripcion"])),
      expediente: getExpedienteFromRow(row),
      apertura: toText(readFirstValue(row, ["APERTURA", "FECHA_APERTURA", "fecha_apertura"])),
      cierre: getCierreFromRow(row),
      fojas: toText(readFirstValue(row, ["N°FOJAS", "N_FOJAS", "n_fojas"])),
      tomo: toText(readFirstValue(row, ["N°_DE_TOMO", "N_DE_TOMO", "N_TOMO", "n_tomo"])),
    });

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-100000px";
    container.style.top = "0";
    container.style.width = "1123px";
    container.style.background = "#ffffff";
    container.style.color = "#000000";
    container.style.fontFamily = "Arial, Helvetica, sans-serif";
    container.style.padding = "12px";
    container.style.boxSizing = "border-box";
    container.innerHTML = `
      <style>
        * { color: #000 !important; -webkit-text-fill-color: #000 !important; }
        table { width: 100% !important; border-collapse: collapse; }
      </style>
      ${templateFilled}
    `;

    document.body.appendChild(container);

    const images = Array.from(container.querySelectorAll("img"));
    await Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
              return;
            }
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          })
      )
    );

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });

    document.body.removeChild(container);

    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/png");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");

    return pdf.output("blob");
  };

  const descargarFilaPdf = async (row: GenericRow) => {
    const rowKey = `${getPdfNameBase(row)}_${Math.random().toString(36).slice(2, 8)}`;
    setPdfRowBusyKey(rowKey);

    try {
      const blob = await createPdfBlobForRow(row);
      downloadBlob(blob, `${getPdfNameBase(row)}.pdf`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setNotification({ message: `No se pudo generar PDF: ${msg}`, type: "error" });
    } finally {
      setPdfRowBusyKey("");
    }
  };

  const descargarTodosPdfZip = async () => {
    if (!filtroAplicadoTotal || registrosTotal.length === 0) {
      setNotification({ message: "Primero filtra Archivo total para generar PDFs.", type: "info" });
      return;
    }

    if (!pdfTemplate) {
      setNotification({ message: "Aún no se cargó la plantilla de formato para PDF.", type: "error" });
      return;
    }

    setPdfAllLoading(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < registrosTotal.length; i += 1) {
        const row = registrosTotal[i];
        const blob = await createPdfBlobForRow(row);
        const base = getPdfNameBase(row) || `registro_${i + 1}`;
        zip.file(`${String(i + 1).padStart(3, "0")}_${base}.pdf`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadBlob(zipBlob, `ARCH_DELE_PDF_${stamp}.zip`);
      setNotification({ message: `Se generaron ${registrosTotal.length} PDFs en un ZIP.`, type: "success" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setNotification({ message: `No se pudieron generar los PDFs: ${msg}`, type: "error" });
    } finally {
      setPdfAllLoading(false);
    }
  };

  const aplicarReglasArchivoMes = (rows: GenericRow[]): {
    rows: GenericRow[];
    totalFojasIncluidas: number;
    totalFojasRango: number;
    topeFojasExcedido: boolean;
  } => {
    const totalRows = rows.length;
    const startRaw = Number(filaInicioMes);
    const endRaw = Number(filaFinMes);
    const maxFojasRaw = Number(maxFojasMes);

    const startIndex = Number.isFinite(startRaw) && startRaw > 0 ? Math.floor(startRaw) : 1;
    const endIndex = Number.isFinite(endRaw) && endRaw > 0 ? Math.floor(endRaw) : totalRows;
    const maxFojas = Number.isFinite(maxFojasRaw) && maxFojasRaw > 0 ? Math.floor(maxFojasRaw) : 400;

    const safeStart = Math.min(Math.max(startIndex, 1), totalRows);
    const safeEnd = Math.min(Math.max(endIndex, safeStart), totalRows);
    const orderedRows = sortRowsByCierreAndId(rows);
    const boundedRows = orderedRows.slice(safeStart - 1, safeEnd);
    const totalFojasRango = boundedRows.reduce((acc, row) => {
      const fojasValue = toNullableInteger(readFirstValue(row, ARCHIVO_HEADERS[7].keys)) || 0;
      return acc + fojasValue;
    }, 0);

    return {
      rows: boundedRows,
      totalFojasIncluidas: totalFojasRango,
      totalFojasRango,
      topeFojasExcedido: totalFojasRango > maxFojas,
    };
  };

  const processedMes = filtroAplicadoMes
    ? aplicarReglasArchivoMes(registrosMesBase)
    : { rows: [] as GenericRow[], totalFojasIncluidas: 0, totalFojasRango: 0, topeFojasExcedido: false };

  const guardarValorMasivoMes = async () => {
    if (!filtroAplicadoMes || processedMes.rows.length === 0) {
      setNotification({ message: "Primero aplica un filtro por mes para seleccionar registros.", type: "info" });
      return;
    }

    const newValue = valorMasivoMes.trim();
    const expedientes = processedMes.rows
      .map((row) => toText(readFirstValue(row, ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente"])))
      .filter(Boolean);

    if (expedientes.length === 0) {
      setNotification({ message: "No se encontraron expedientes válidos para actualizar.", type: "error" });
      return;
    }

    setGuardandoMasivoMes(true);

    try {
      // Usar RPC para ejecutar SQL directo y evitar problemas con caracteres especiales
      const { error } = await supabase.rpc('update_arch_dele_bulk', {
        p_expedientes: expedientes,
        p_campo: campoMasivoMes === "N°CAJA" ? "N°CAJA" : "N°_DE_TOMO",
        p_valor: newValue,
      });

      if (error) {
        setGuardandoMasivoMes(false);
        setNotification({ message: `No se pudo guardar el valor masivo: ${error.message}`, type: "error" });
        return;
      }

      const expedienteSet = new Set(expedientes);
      const applyLocalUpdate = (row: GenericRow): GenericRow => {
        const exp = toText(readFirstValue(row, ["N°_DE_EXPEDIENTE", "N_DE_EXPEDIENTE", "EXPEDIENTE", "expediente"]));
        if (!expedienteSet.has(exp)) return row;
        return {
          ...row,
          [campoMasivoMes]: newValue,
        };
      };

      setRegistrosMesBase((prev) => prev.map(applyLocalUpdate));
      setGuardandoMasivoMes(false);
      setNotification({
        message: `Se actualizó ${campoMasivoMes} para ${expedientes.length} registros del rango visible del mes.`,
        type: "success",
      });
    } catch (err) {
      setGuardandoMasivoMes(false);
      setNotification({ message: `Error al guardar: ${err instanceof Error ? err.message : "Error desconocido"}`, type: "error" });
    }
  };

  const descargarExcel = () => {
    const rowsToExport = activeOption === "archivo_por_mes" ? processedMes.rows : registrosTotal;
    const hasFilterApplied = activeOption === "archivo_por_mes" ? filtroAplicadoMes : filtroAplicadoTotal;

    if (!hasFilterApplied) {
      setNotification({ message: "Aplica un filtro antes de descargar el Excel.", type: "info" });
      return;
    }

    if (rowsToExport.length === 0) {
      setNotification({ message: "No hay datos filtrados para descargar.", type: "info" });
      return;
    }

    const exportData = rowsToExport.map((row) => {
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Arch_dele");

    worksheet["!cols"] = ARCHIVO_HEADERS.map((header) => ({
      wch: header.label === "DESCRIPCIÓN" ? 80 : header.label === "SERIE/SUBSERIE_DOCUMENTAL" ? 36 : 18,
    }));

    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
    const thinBorder = {
      top: { style: "thin", color: { rgb: "FF000000" } },
      bottom: { style: "thin", color: { rgb: "FF000000" } },
      left: { style: "thin", color: { rgb: "FF000000" } },
      right: { style: "thin", color: { rgb: "FF000000" } },
    };

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

    for (let r = 1; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[addr] as (XLSX.CellObject & { s?: Record<string, unknown>; z?: string }) | undefined;
        if (cell) {
          cell.t = "s";
          cell.v = String(cell.v ?? "");
          cell.z = "@";
          cell.s = {
            font: { name: "Calibri", sz: 11, color: { rgb: "FF000000" } },
            alignment: { horizontal: "left", vertical: "center", wrapText: true },
            border: thinBorder,
          };
        }
      }
    }

    const fileSuffix = activeOption === "archivo_por_mes"
      ? `${anioFiltro || "todos"}_${mesFiltro || "todos"}`
      : `${fechaInicioTotal || "inicio"}_${fechaFinTotal || "fin"}`.replace(/-/g, "_");

    XLSX.writeFile(workbook, `ARCH_DELE_${activeOption}_${fileSuffix}.xlsx`);
  };

  const filtrarArchivoPorMes = async () => {
    if (!mesFiltro || !anioFiltro) {
      setNotification({ message: "Selecciona mes y año para filtrar Archivo por mes.", type: "info" });
      return;
    }

    const range = getMonthDateRange(anioFiltro, mesFiltro);
    if (!range) {
      setNotification({ message: "El mes/año seleccionado no es válido.", type: "error" });
      return;
    }

    setLoadingMes(true);
    const PAGE_SIZE = 1000;
    let from = 0;
    const allRows: GenericRow[] = [];

    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("Arch_dele")
        .select("*")
        .not("APERTURA", "is", null)
        .not("CIERRE", "is", null)
        .gte("CIERRE", range.start)
        .lt("CIERRE", range.nextMonthStart)
        .order("CIERRE", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (error) {
        setLoadingMes(false);
        setNotification({ message: `No se pudo filtrar Archivo por mes: ${error.message}`, type: "error" });
        return;
      }

      const chunk = (data || []) as GenericRow[];
      allRows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    setRegistrosMesBase(sortRowsByCierreAndId(allRows));
    setFiltroAplicadoMes(true);
    setLoadingMes(false);
  };

  const filtrarArchivoTotal = async () => {
    if (!fechaInicioTotal && !fechaFinTotal) {
      setNotification({ message: "Selecciona fecha inicio o fecha fin para filtrar Archivo total.", type: "info" });
      return;
    }

    setLoadingTotal(true);
    const PAGE_SIZE = 1000;
    let from = 0;
    const allRows: GenericRow[] = [];

    while (true) {
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("Arch_dele")
        .select("*")
        .not("APERTURA", "is", null)
        .not("CIERRE", "is", null)
        .order("CIERRE", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (fechaInicioTotal) query = query.gte("CIERRE", fechaInicioTotal);
      if (fechaFinTotal) query = query.lte("CIERRE", fechaFinTotal);

      const { data, error } = await query;

      if (error) {
        setLoadingTotal(false);
        setNotification({ message: `No se pudo filtrar Archivo total: ${error.message}`, type: "error" });
        return;
      }

      const chunk = (data || []) as GenericRow[];
      allRows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    setRegistrosTotal(sortRowsByCierreAndId(allRows));
    setFiltroAplicadoTotal(true);
    setLoadingTotal(false);
  };

  const sincronizarDesdeFlagrancia = async () => {
    setSyncing(true);
    try {
      const result = await syncArchDeleFromFlagranciaGlobal();
      setRegistrosMesBase([]);
      setRegistrosTotal([]);
      setFiltroAplicadoMes(false);
      setFiltroAplicadoTotal(false);
      setNotification({
        message: `Arch_dele actualizado con ${result.dedupedCount} registros desde FLAGRANCIA${result.skippedDuplicates > 0 ? ` (${result.skippedDuplicates} duplicados omitidos por N°_DE_EXPEDIENTE)` : ""}${result.omittedWithoutDates > 0 ? ` (${result.omittedWithoutDates} omitidos por no tener APERTURA/CIERRE)` : ""}. Usa filtros para visualizar información.`,
        type: "success",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error desconocido al sincronizar Arch_dele.";
      setNotification({ message, type: "error" });
    } finally {
      setSyncing(false);
    }
  };

  const aniosCierreDisponibles = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const baseYear = 2020;
    return Array.from({ length: currentYear - baseYear + 2 }, (_, idx) => String(currentYear + 1 - idx));
  }, []);

  const renderTable = (
    rows: GenericRow[],
    loading: boolean,
    filtroAplicado: boolean,
    hint: string,
    opts?: { showPdfActions?: boolean }
  ) => {
    const showPdfActions = Boolean(opts?.showPdfActions);

    return (
      <div className="max-h-[360px] overflow-auto custom-scrollbar">
        <table className="w-full text-[10px] text-left border-collapse min-w-[62rem]">
          <thead className="sticky top-0 bg-[#01376d] text-white uppercase font-black z-10">
            <tr>
              {ARCHIVO_HEADERS.map((header) => (
                <th key={header.label} className="p-3 border-r border-black/30 whitespace-nowrap">
                  {header.label}
                </th>
              ))}
              {showPdfActions && <th className="p-3 border-r border-black/30 whitespace-nowrap">PDF</th>}
            </tr>
          </thead>
          <tbody className="text-white/75">
            {!loading && !filtroAplicado && (
              <tr>
                <td colSpan={ARCHIVO_HEADERS.length + (showPdfActions ? 1 : 0)} className="p-6 text-center text-white/40 text-sm">
                  {hint}
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={ARCHIVO_HEADERS.length + (showPdfActions ? 1 : 0)} className="p-6 text-center text-white/50 text-sm">
                  Cargando datos...
                </td>
              </tr>
            )}

            {!loading && filtroAplicado && rows.length === 0 && (
              <tr>
                <td colSpan={ARCHIVO_HEADERS.length + (showPdfActions ? 1 : 0)} className="p-6 text-center text-white/40 text-sm">
                  Sin datos para mostrar.
                </td>
              </tr>
            )}

            {!loading && filtroAplicado && rows.map((row, idx) => (
              <tr key={`arch-${idx}`} className="border-t border-white/10 hover:bg-white/5">
                {ARCHIVO_HEADERS.map((header) => (
                  <td key={`${header.label}-${idx}`} className="p-3 whitespace-nowrap font-mono">
                    {toText(readFirstValue(row, header.keys))}
                  </td>
                ))}
                {showPdfActions && (
                  <td className="p-3 whitespace-nowrap">
                    <button
                      onClick={() => void descargarFilaPdf(row)}
                      disabled={pdfAllLoading || !pdfTemplate || pdfRowBusyKey.length > 0}
                      className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Descargar PDF
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-5 animate-in fade-in duration-500">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      <div className="flex flex-wrap gap-2 p-1 bg-black/20 rounded-2xl w-fit border border-white/5">
        <button
          onClick={() => setActiveOption("archivo_por_mes")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeOption === "archivo_por_mes" ? "bg-cyan-500/20 text-cyan-200" : "text-white/40 hover:text-white"
          }`}
        >
          1.- Archivo por mes
        </button>
        <button
          onClick={() => setActiveOption("archivo_total")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeOption === "archivo_total" ? "bg-cyan-500/20 text-cyan-200" : "text-white/40 hover:text-white"
          }`}
        >
          2.- Archivo total
        </button>
        <button
          onClick={sincronizarDesdeFlagrancia}
          disabled={syncing}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-white/10 text-white hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncing ? "Sincronizando..." : "Actualizar Arch_dele"}
        </button>
        <button
          onClick={descargarExcel}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-green-600 text-white hover:bg-green-500"
        >
          Descargar Excel
        </button>
      </div>

      {activeOption === "archivo_por_mes" && (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Archivo por mes</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Mes (CIERRE)</label>
              <select
                value={mesFiltro}
                onChange={(e) => {
                  setMesFiltro(e.target.value);
                  setFiltroAplicadoMes(false);
                  setRegistrosMesBase([]);
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              >
                <option value="" className="bg-black text-white">Todos</option>
                <option value="01" className="bg-black text-white">01 - Enero</option>
                <option value="02" className="bg-black text-white">02 - Febrero</option>
                <option value="03" className="bg-black text-white">03 - Marzo</option>
                <option value="04" className="bg-black text-white">04 - Abril</option>
                <option value="05" className="bg-black text-white">05 - Mayo</option>
                <option value="06" className="bg-black text-white">06 - Junio</option>
                <option value="07" className="bg-black text-white">07 - Julio</option>
                <option value="08" className="bg-black text-white">08 - Agosto</option>
                <option value="09" className="bg-black text-white">09 - Septiembre</option>
                <option value="10" className="bg-black text-white">10 - Octubre</option>
                <option value="11" className="bg-black text-white">11 - Noviembre</option>
                <option value="12" className="bg-black text-white">12 - Diciembre</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Año (CIERRE)</label>
              <select
                value={anioFiltro}
                onChange={(e) => {
                  setAnioFiltro(e.target.value);
                  setFiltroAplicadoMes(false);
                  setRegistrosMesBase([]);
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              >
                <option value="" className="bg-black text-white">Todos</option>
                {aniosCierreDisponibles.map((year) => (
                  <option key={year} value={year} className="bg-black text-white">
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Total de filas</label>
              <div className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-bold text-cyan-300 flex items-center h-10">
                {registrosMesBase.length}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Campo</label>
              <select
                value={campoMasivoMes}
                onChange={(e) => setCampoMasivoMes(e.target.value as "N°CAJA" | "N°_DE_TOMO")}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              >
                <option value="N°CAJA" className="bg-black text-white">N°CAJA</option>
                <option value="N°_DE_TOMO" className="bg-black text-white">N°_DE_TOMO</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Valor</label>
              <input
                type="text"
                value={valorMasivoMes}
                onChange={(e) => setValorMasivoMes(e.target.value)}
                placeholder="Ej: 1 o 1/2"
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Fila inicio</label>
              <input
                type="number"
                min={1}
                value={filaInicioMes}
                onChange={(e) => setFilaInicioMes(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Fila fin</label>
              <input
                type="number"
                min={1}
                value={filaFinMes}
                onChange={(e) => setFilaFinMes(e.target.value)}
                placeholder="Ej: 30"
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Máx. fojas</label>
              <div className={`w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-bold ${
                processedMes.totalFojasRango > 400 ? 'text-red-400' : 'text-white'
              }`}>
                {processedMes.totalFojasRango} fojas
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={guardarValorMasivoMes}
                disabled={guardandoMasivoMes || !filtroAplicadoMes || processedMes.rows.length === 0}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold transition-all bg-amber-500/20 text-amber-100 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {guardandoMasivoMes ? "Guardando..." : "Guardar valor"}
              </button>
            </div>
          </div>

          <button
            onClick={filtrarArchivoPorMes}
            disabled={loadingMes}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMes ? "Filtrando..." : "Filtrar"}
          </button>

          {filtroAplicadoMes && (
            <div className="text-[11px] text-cyan-100/75">
              Guardado masivo sobre <span className="font-bold text-white">{processedMes.rows.length}</span> filas visibles del rango actual, de un total de <span className="font-bold text-white">{registrosMesBase.length}</span> filas del mes.
            </div>
          )}

          {filtroAplicadoMes && processedMes.topeFojasExcedido && (
            <div className="text-[11px] text-amber-300">
              Aviso: el rango actual supera las {maxFojasMes} fojas. No se recortaron filas automaticamente.
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
            {renderTable(processedMes.rows, loadingMes, filtroAplicadoMes, "Aplica un filtro por mes y año para ver información.")}
          </div>
        </div>
      )}

      {activeOption === "archivo_total" && (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Archivo total</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Fecha inicio</label>
              <input
                type="date"
                value={fechaInicioTotal}
                onChange={(e) => {
                  setFechaInicioTotal(e.target.value);
                  setFiltroAplicadoTotal(false);
                  setRegistrosTotal([]);
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Fecha fin</label>
              <input
                type="date"
                value={fechaFinTotal}
                onChange={(e) => {
                  setFechaFinTotal(e.target.value);
                  setFiltroAplicadoTotal(false);
                  setRegistrosTotal([]);
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          <button
            onClick={filtrarArchivoTotal}
            disabled={loadingTotal}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingTotal ? "Filtrando..." : "Filtrar"}
          </button>

          <button
            onClick={descargarTodosPdfZip}
            disabled={pdfAllLoading || loadingTotal || !filtroAplicadoTotal || registrosTotal.length === 0 || !pdfTemplate}
            className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pdfAllLoading ? "Generando ZIP de PDFs..." : "Descargar todos los PDF (ZIP)"}
          </button>

          <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
            {renderTable(registrosTotal, loadingTotal, filtroAplicadoTotal, "Aplica un rango de fechas para ver información.", { showPdfActions: true })}
          </div>
        </div>
      )}
    </div>
  );
}
