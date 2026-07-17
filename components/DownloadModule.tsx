"use client";
import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx-js-style";
import Notification from "./Notification";

type ReportOption = "archivo_por_mes" | "archivo_total";
type GenericRow = Record<string, unknown>;

const ARCHIVO_HEADERS = [
  { label: "SERIE/SUBSERIE_DOCUMENTAL", keys: ["serie"] },
  { label: "N°CAJA", keys: ["n_caja"] },
  { label: "N°_DE_EXPEDIENTE", keys: ["expediente"] },
  { label: "N°_DE_TOMO", keys: ["n_tomo"] },
  { label: "DESCRIPCIÓN", keys: ["descripcion"] },
  { label: "APERTURA", keys: ["fecha_apertura"] },
  { label: "CIERRE", keys: ["fecha_cierre"] },
  { label: "N°FOJAS", keys: ["n_fojas"] },
  { label: "DESTINO_FINAL", keys: ["destino_final"] },
  { label: "SOPORTE", keys: ["soporte"] },
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
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(firstChunk)) {
    const [d, m, y] = firstChunk.split(/[/-]/);
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
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
  return `${year}-${month}-${day}`;
};

const getMonthDateRange = (year: string, month: string): { start: string; nextMonthStart: string } | null => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const startDate = new Date(y, m - 1, 1);
  const nextMonthDate = new Date(y, m, 1);
  return { start: formatDateIso(startDate), nextMonthStart: formatDateIso(nextMonthDate) };
};

const sanitizeFileName = (value: string): string => value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();

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

const DAY_OPTIONS = Array.from({ length: 31 }, (_, idx) => String(idx + 1).padStart(2, "0"));

const buildIsoDate = (year: string, month: string, day: string): string => {
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

const toDisplayDate = (value: string): string => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return value;
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
};

const getPdfNameBase = (row: GenericRow): string => {
  const expediente = toText(readFirstValue(row, ["expediente"])) || "SIN_EXPEDIENTE";
  const cierre = toText(readFirstValue(row, ["fecha_cierre"])) || "SIN_CIERRE";
  return sanitizeFileName(`${expediente}_${cierre}`);
};

const sortRowsByCierreAndId = (rows: GenericRow[]): GenericRow[] => {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const aDate = toSortableDateNumber(readFirstValue(a, ["fecha_cierre"]));
    const bDate = toSortableDateNumber(readFirstValue(b, ["fecha_cierre"]));
    if (aDate !== bDate) return aDate - bDate;

    const aId = Number(a.id ?? 0);
    const bId = Number(b.id ?? 0);
    if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) return aId - bId;
    return toText(a.expediente).localeCompare(toText(b.expediente));
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

    if (!headStyles && !bodyContent) {
      return template;
    }

    return `${headStyles}\n${bodyContent}`.trim();
  } catch {
    return template;
  }
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

export default function DownloadModule() {
  const [activeOption, setActiveOption] = useState<ReportOption>("archivo_por_mes");
  const [registrosMesBase, setRegistrosMesBase] = useState<GenericRow[]>([]);
  const [registrosTotal, setRegistrosTotal] = useState<GenericRow[]>([]);
  const [loadingMes, setLoadingMes] = useState(false);
  const [loadingTotal, setLoadingTotal] = useState(false);
  const [filtroAplicadoMes, setFiltroAplicadoMes] = useState(false);
  const [filtroAplicadoTotal, setFiltroAplicadoTotal] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "error" | "info" | "success" } | null>(null);

  const [mesFiltro, setMesFiltro] = useState("");
  const [anioFiltro, setAnioFiltro] = useState("");
  const [campoMasivoMes, setCampoMasivoMes] = useState<"n_caja" | "n_tomo">("n_caja");
  const [valorMasivoMes, setValorMasivoMes] = useState("");
  const [guardandoMasivoMes, setGuardandoMasivoMes] = useState(false);
  const [filaInicioMes, setFilaInicioMes] = useState("1");
  const [filaFinMes, setFilaFinMes] = useState("");
  const maxFojasMes = "400";

  const [aniosCierreDisponibles, setAniosCierreDisponibles] = useState<string[]>([]);

  const [inicioYear, setInicioYear] = useState("");
  const [inicioMonth, setInicioMonth] = useState("");
  const [inicioDay, setInicioDay] = useState("");
  const [finYear, setFinYear] = useState("");
  const [finMonth, setFinMonth] = useState("");
  const [finDay, setFinDay] = useState("");
  const [pdfTemplate, setPdfTemplate] = useState("");
  const [pdfAllLoading, setPdfAllLoading] = useState(false);
  const [pdfRowBusyKey, setPdfRowBusyKey] = useState("");

  const fechaInicioTotal = useMemo(() => buildIsoDate(inicioYear, inicioMonth, inicioDay), [inicioYear, inicioMonth, inicioDay]);
  const fechaFinTotal = useMemo(() => buildIsoDate(finYear, finMonth, finDay), [finYear, finMonth, finDay]);

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

  useEffect(() => {
    let active = true;

    const loadYears = async () => {
      const years = new Set<string>();
      const PAGE_SIZE = 1000;
      let from = 0;

      while (true) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from("delegaciones_viejas")
          .select("fecha_cierre")
          .not("fecha_cierre", "is", null)
          .order("fecha_cierre", { ascending: false })
          .range(from, to);

        if (error) break;

        const chunk = (data || []) as GenericRow[];
        chunk.forEach((row) => {
          const normalized = normalizeDateValue(toText(row["fecha_cierre"]));
          const year = normalized.split("-")[0] || "";
          if (/^\d{4}$/.test(year)) years.add(year);
        });

        if (chunk.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
      const fallbackYear = String(new Date().getFullYear());
      const finalYears = sorted.length > 0 ? sorted : [fallbackYear];

      if (!active) return;
      setAniosCierreDisponibles(finalYears);
      const defaultYear = finalYears[0];
      setAnioFiltro((prev) => prev || defaultYear);
      setInicioYear((prev) => prev || defaultYear);
      setFinYear((prev) => prev || defaultYear);
    };

    void loadYears();

    return () => {
      active = false;
    };
  }, []);

  const createPdfBlobForRow = async (row: GenericRow): Promise<Blob> => {
    if (!pdfTemplate) {
      throw new Error("La plantilla HTML aun no se cargo.");
    }

    const templateFilled = replaceTemplateTokens(pdfTemplate, {
      descripcion: toText(readFirstValue(row, ["descripcion"])),
      expediente: toText(readFirstValue(row, ["expediente"])),
      apertura: toDisplayDate(toText(readFirstValue(row, ["fecha_apertura"]))),
      cierre: toDisplayDate(toText(readFirstValue(row, ["fecha_cierre"]))),
      fojas: toText(readFirstValue(row, ["n_fojas"])),
      tomo: toText(readFirstValue(row, ["n_tomo"])),
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
    container.style.padding = "0";
    container.style.boxSizing = "border-box";
    container.innerHTML = `<style>* { color: #000 !important; -webkit-text-fill-color: #000 !important; } img { display: block; }</style>${templateFilled}`;

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

    if (renderHeight > maxHeight) {
      renderHeight = maxHeight;
      renderWidth = renderHeight * canvasRatio;
    }

    const offsetX = (pageWidth - renderWidth) / 2;
    const offsetY = (pageHeight - renderHeight) / 2;

    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    pdf.addImage(imgData, "PNG", offsetX, offsetY, renderWidth, renderHeight, undefined, "FAST");

    return pdf.output("blob");
  };

  const imprimirFilaPdf = (row: GenericRow) => {
    if (!pdfTemplate) {
      setNotification({ message: "La plantilla de formato aun no se cargo.", type: "error" });
      return;
    }

    const templateFilled = replaceTemplateTokens(pdfTemplate, {
      descripcion: toText(readFirstValue(row, ["descripcion"])),
      expediente: toText(readFirstValue(row, ["expediente"])),
      apertura: toDisplayDate(toText(readFirstValue(row, ["fecha_apertura"]))),
      cierre: toDisplayDate(toText(readFirstValue(row, ["fecha_cierre"]))),
      fojas: toText(readFirstValue(row, ["n_fojas"])),
      tomo: toText(readFirstValue(row, ["n_tomo"])),
    });

    const ventana = window.open("", "_blank", "width=1200,height=800");
    if (!ventana) {
      setNotification({ message: "No se pudo abrir la ventana de impresion. Verifica que no este bloqueada.", type: "error" });
      return;
    }

    ventana.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Caratula delegacion</title>
  <style>
    @page { size: A4 landscape; margin: 6mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; }
  </style>
</head>
<body>
  ${templateFilled}
</body>
</html>`);
    ventana.document.close();
    ventana.focus();
    ventana.onload = () => {
      ventana.print();
      ventana.close();
    };
  };

  const descargarTodosPdfZip = async () => {
    if (!filtroAplicadoTotal || registrosTotal.length === 0) {
      setNotification({ message: "Primero filtra Archivo total para generar PDFs.", type: "info" });
      return;
    }

    if (!pdfTemplate) {
      setNotification({ message: "Aun no se cargo la plantilla de formato para PDF.", type: "error" });
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
      downloadBlob(zipBlob, `DELEGACIONES_VIEJAS_PDF_${stamp}.zip`);
      setNotification({ message: `Se generaron ${registrosTotal.length} PDFs en un ZIP.`, type: "success" });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setNotification({ message: `No se pudieron generar los PDFs: ${msg}`, type: "error" });
    } finally {
      setPdfAllLoading(false);
    }
  };

  const aplicarReglasArchivoMes = (rows: GenericRow[]) => {
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
      const n = Number(String(readFirstValue(row, ["n_fojas"]) || "0").replace(/\D/g, "")) || 0;
      return acc + n;
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

    const ids = processedMes.rows.map((row) => row.id).filter(Boolean);
    if (ids.length === 0) {
      setNotification({ message: "No se encontraron registros validos para actualizar.", type: "error" });
      return;
    }

    const newValue = valorMasivoMes.trim();
    setGuardandoMasivoMes(true);

    try {
      for (const id of ids) {
        const { error } = await supabase
          .from("delegaciones_viejas")
          .update({ [campoMasivoMes]: newValue })
          .eq("id", id);

        if (error) {
          throw new Error(error.message);
        }
      }

      setRegistrosMesBase((prev) =>
        prev.map((row) => (ids.includes(row.id) ? { ...row, [campoMasivoMes]: newValue } : row))
      );

      setNotification({ message: `Se actualizo ${campoMasivoMes} para ${ids.length} registros del rango visible del mes.`, type: "success" });
    } catch (err) {
      setNotification({ message: `No se pudo guardar el valor masivo: ${err instanceof Error ? err.message : "Error desconocido"}`, type: "error" });
    } finally {
      setGuardandoMasivoMes(false);
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
    XLSX.utils.book_append_sheet(workbook, worksheet, "delegaciones_viejas");

    const aperturaCol = ARCHIVO_HEADERS.findIndex((header) => header.label === "APERTURA");
    const cierreCol = ARCHIVO_HEADERS.findIndex((header) => header.label === "CIERRE");
    const dateCols = new Set([aperturaCol, cierreCol].filter((idx) => idx >= 0));

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
          const originalValue = String(cell.v ?? "");
          const isDateColumn = dateCols.has(c);
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

    const fileSuffix = activeOption === "archivo_por_mes"
      ? `${anioFiltro || "todos"}_${mesFiltro || "todos"}`
      : `${fechaInicioTotal || "inicio"}_${fechaFinTotal || "fin"}`.replace(/-/g, "_");

    XLSX.writeFile(workbook, `DELEGACIONES_VIEJAS_${activeOption}_${fileSuffix}.xlsx`);
  };

  const filtrarArchivoPorMes = async () => {
    if (!mesFiltro || !anioFiltro) {
      setNotification({ message: "Selecciona mes y ano para filtrar Archivo por mes.", type: "info" });
      return;
    }

    const range = getMonthDateRange(anioFiltro, mesFiltro);
    if (!range) {
      setNotification({ message: "El mes/ano seleccionado no es valido.", type: "error" });
      return;
    }

    setLoadingMes(true);
    const PAGE_SIZE = 1000;
    let from = 0;
    const allRows: GenericRow[] = [];

    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("delegaciones_viejas")
        .select("*")
        .not("fecha_apertura", "is", null)
        .not("fecha_cierre", "is", null)
        .gte("fecha_cierre", range.start)
        .lt("fecha_cierre", range.nextMonthStart)
        .order("fecha_cierre", { ascending: true })
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
        .from("delegaciones_viejas")
        .select("*")
        .not("fecha_apertura", "is", null)
        .not("fecha_cierre", "is", null)
        .order("fecha_cierre", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (fechaInicioTotal) query = query.gte("fecha_cierre", fechaInicioTotal);
      if (fechaFinTotal) query = query.lte("fecha_cierre", fechaFinTotal);

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
              {showPdfActions && (
                <th className="sticky left-0 z-20 bg-[#01376d] p-3 border-r border-black/30 whitespace-nowrap">
                  PDF
                </th>
              )}
              {ARCHIVO_HEADERS.map((header) => (
                <th key={header.label} className="p-3 border-r border-black/30 whitespace-nowrap">
                  {header.label}
                </th>
              ))}
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

            {!loading && filtroAplicado && rows.map((row, idx) => {
              const rowKey = String(row.id ?? `row-${idx}`);
              return (
                <tr key={`arch-${rowKey}`} className="border-t border-white/10 hover:bg-white/5">
                  {showPdfActions && (
                    <td className="sticky left-0 z-10 bg-[#021b35] p-3 whitespace-nowrap">
                      <button
                        onClick={async () => {
                          setPdfRowBusyKey(rowKey);
                          try {
                            imprimirFilaPdf(row);
                          } finally {
                            setPdfRowBusyKey("");
                          }
                        }}
                        disabled={pdfAllLoading || !pdfTemplate || pdfRowBusyKey === rowKey}
                        className="px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {pdfRowBusyKey === rowKey ? "Imprimiendo..." : "Imprimir PDF"}
                      </button>
                    </td>
                  )}
                  {ARCHIVO_HEADERS.map((header) => (
                    <td key={`${header.label}-${rowKey}`} className="p-3 whitespace-nowrap font-mono">
                      {toText(readFirstValue(row, header.keys))}
                    </td>
                  ))}
                </tr>
              );
            })}
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
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value} className="bg-black text-white">{month.label}</option>
                ))}
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
                  <option key={year} value={year} className="bg-black text-white">{year}</option>
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
                onChange={(e) => setCampoMasivoMes(e.target.value as "n_caja" | "n_tomo")}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              >
                <option value="n_caja" className="bg-black text-white">N°CAJA</option>
                <option value="n_tomo" className="bg-black text-white">N°_DE_TOMO</option>
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
              <input type="number" min={1} value={filaInicioMes} onChange={(e) => setFilaInicioMes(e.target.value)} className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Fila fin</label>
              <input type="number" min={1} value={filaFinMes} onChange={(e) => setFilaFinMes(e.target.value)} placeholder="Ej: 30" className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Máx. fojas</label>
              <div className={`w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-bold ${
                processedMes.totalFojasRango > 400 ? "text-red-400" : "text-white"
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

          <button onClick={filtrarArchivoPorMes} disabled={loadingMes} className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed">
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
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={inicioYear}
                  onChange={(e) => {
                    setInicioYear(e.target.value);
                    setFiltroAplicadoTotal(false);
                    setRegistrosTotal([]);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-black text-white">Año</option>
                  {aniosCierreDisponibles.map((year) => (
                    <option key={`ini-year-${year}`} value={year} className="bg-black text-white">{year}</option>
                  ))}
                </select>
                <select
                  value={inicioMonth}
                  onChange={(e) => {
                    setInicioMonth(e.target.value);
                    setFiltroAplicadoTotal(false);
                    setRegistrosTotal([]);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-black text-white">Mes</option>
                  {MONTH_OPTIONS.map((month) => (
                    <option key={`ini-month-${month.value}`} value={month.value} className="bg-black text-white">{month.value}</option>
                  ))}
                </select>
                <select
                  value={inicioDay}
                  onChange={(e) => {
                    setInicioDay(e.target.value);
                    setFiltroAplicadoTotal(false);
                    setRegistrosTotal([]);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-black text-white">Día</option>
                  {DAY_OPTIONS.map((day) => (
                    <option key={`ini-day-${day}`} value={day} className="bg-black text-white">{day}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Fecha fin</label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={finYear}
                  onChange={(e) => {
                    setFinYear(e.target.value);
                    setFiltroAplicadoTotal(false);
                    setRegistrosTotal([]);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-black text-white">Año</option>
                  {aniosCierreDisponibles.map((year) => (
                    <option key={`fin-year-${year}`} value={year} className="bg-black text-white">{year}</option>
                  ))}
                </select>
                <select
                  value={finMonth}
                  onChange={(e) => {
                    setFinMonth(e.target.value);
                    setFiltroAplicadoTotal(false);
                    setRegistrosTotal([]);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-black text-white">Mes</option>
                  {MONTH_OPTIONS.map((month) => (
                    <option key={`fin-month-${month.value}`} value={month.value} className="bg-black text-white">{month.value}</option>
                  ))}
                </select>
                <select
                  value={finDay}
                  onChange={(e) => {
                    setFinDay(e.target.value);
                    setFiltroAplicadoTotal(false);
                    setRegistrosTotal([]);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-black text-white">Día</option>
                  {DAY_OPTIONS.map((day) => (
                    <option key={`fin-day-${day}`} value={day} className="bg-black text-white">{day}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <button onClick={filtrarArchivoTotal} disabled={loadingTotal} className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed">
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