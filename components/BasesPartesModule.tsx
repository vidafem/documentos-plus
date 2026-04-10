"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

type GenericRow = Record<string, string | number | null>;
type SourceTable = "PARTES" | "partes_viejas";
type ActiveOption = "por_mes" | "total";

type BasesPartesModuleProps = {
  sourceTable: SourceTable;
  title: string;
};

const TABLE_HEADERS: Array<{ label: string; key: string }> = [
  { label: "EXPEDIENTE", key: "expediente" },
  { label: "DESCRIPCION", key: "descripcion" },
  { label: "FECHA APERTURA", key: "fecha_apertura" },
  { label: "FECHA CIERRE", key: "fecha_cierre" },
  { label: "N° FOJAS", key: "n_fojas" },
  { label: "N° TOMO", key: "n_tomo" },
  { label: "N° CAJA", key: "n_caja" },
  { label: "DESTINO FINAL", key: "destino_final" },
  { label: "SERIE", key: "serie" },
  { label: "SOPORTE", key: "soporte" },
  { label: "UBICACION", key: "ubicacion" },
  { label: "OBSERVACIONES", key: "observaciones" },
];

const toText = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value);
};

const parseExpediente = (value: unknown): { seq: number; year: number } => {
  const raw = toText(value).trim();
  const match = raw.match(/^(\d+)-(\d{4})$/);
  if (!match) {
    return { seq: Number.MAX_SAFE_INTEGER, year: Number.MAX_SAFE_INTEGER };
  }
  const seq = Number(match[1]);
  const year = Number(match[2]);
  return {
    seq: Number.isFinite(seq) ? seq : Number.MAX_SAFE_INTEGER,
    year: Number.isFinite(year) ? year : Number.MAX_SAFE_INTEGER,
  };
};

const normalizeDate = (value: string): string => {
  const raw = value.trim();
  if (!raw) return "";
  const normalized = raw.replace(/\//g, "-");
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const isoDateToExcelSerial = (value: string): number | null => {
  const normalized = normalizeDate(value);
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

const toDisplayDate = (value: string): string => {
  const normalized = normalizeDate(value);
  if (!normalized) return value;
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
};

const encodeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const replacePartesTemplateTokens = (
  template: string,
  values: {
    descripcion: string;
    expediente: string;
    apertura: string;
    cierre: string;
    fojas: string;
    tomo: string;
  }
): string => {
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

  replaceLiteral(["{{DESCRIPCION}}", "{{ DESCRIPCION }}", "{{descripcion}}", "{{ descripcion }}"], encoded.descripcion);
  replaceMany([/\{\{\s*DESCRIPCION\s*\}\}/gi], encoded.descripcion);

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

  replaceLiteral(["{{APERTURA}}", "{{ APERTURA }}", "{{apertura}}", "{{ apertura }}"], encoded.apertura);
  replaceMany([/\{\{\s*APERTURA\s*\}\}/gi], encoded.apertura);

  replaceLiteral(["{{CIERRE}}", "{{ CIERRE }}", "{{cierre}}", "{{ cierre }}"], encoded.cierre);
  replaceMany([/\{\{\s*CIERRE\s*\}\}/gi], encoded.cierre);

  replaceLiteral(["{{N° FOJAS}}", "{{ N° FOJAS }}", "{{N&deg; FOJAS}}", "{{ N&deg; FOJAS }}"], encoded.fojas);
  replaceMany([/\{\{\s*N°\s*FOJAS\s*\}\}/g, /\{\{\s*N&deg;\s*FOJAS\s*\}\}/g, /\{\{\s*N&#176;\s*FOJAS\s*\}\}/g], encoded.fojas);

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

const getMonthDateRange = (year: string, month: string) => {
  if (!year || !month) return null;
  const monthNum = Number(month);
  if (!Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return null;

  const monthPadded = String(monthNum).padStart(2, "0");
  const firstDay = `${year}-${monthPadded}-01`;
  const lastDayNumber = new Date(Number(year), monthNum, 0).getDate();
  const lastDay = `${year}-${monthPadded}-${String(lastDayNumber).padStart(2, "0")}`;

  return { firstDay, lastDay };
};

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

const sortRowsByFechaAndExpediente = (rows: GenericRow[]): GenericRow[] => {
  const copy = [...rows];

  copy.sort((a, b) => {
    const fechaA = normalizeDate(toText(a.fecha_cierre));
    const fechaB = normalizeDate(toText(b.fecha_cierre));

    if (fechaA !== fechaB) {
      return fechaA.localeCompare(fechaB);
    }

    const expA = parseExpediente(a.expediente);
    const expB = parseExpediente(b.expediente);

    if (expA.year !== expB.year) {
      return expA.year - expB.year;
    }

    if (expA.seq !== expB.seq) {
      return expA.seq - expB.seq;
    }

    return toText(a.id).localeCompare(toText(b.id));
  });

  return copy;
};

const getMostFrequentTomo = (rows: GenericRow[]): string => {
  const counts = new Map<string, number>();
  const firstOrder: string[] = [];

  for (const row of rows) {
    const value = toText(row.n_tomo).trim();
    if (!value) continue;

    if (!counts.has(value)) {
      counts.set(value, 0);
      firstOrder.push(value);
    }
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  if (counts.size === 0) return "1";

  let best = firstOrder[0];
  let bestCount = counts.get(best) || 0;

  for (const value of firstOrder) {
    const count = counts.get(value) || 0;
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }

  return best;
};

export default function BasesPartesModule({ sourceTable, title }: BasesPartesModuleProps) {
  const [activeOption, setActiveOption] = useState<ActiveOption>("por_mes");
  const [rows, setRows] = useState<GenericRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroAplicado, setFiltroAplicado] = useState(false);

  const [mesFiltro, setMesFiltro] = useState("");
  const [anioFiltro, setAnioFiltro] = useState("");

  const [aniosDisponibles, setAniosDisponibles] = useState<string[]>([]);
  const [inicioYear, setInicioYear] = useState("");
  const [inicioMonth, setInicioMonth] = useState("");
  const [inicioDay, setInicioDay] = useState("");
  const [finYear, setFinYear] = useState("");
  const [finMonth, setFinMonth] = useState("");
  const [finDay, setFinDay] = useState("");

  const fechaInicio = useMemo(() => buildIsoDate(inicioYear, inicioMonth, inicioDay), [inicioYear, inicioMonth, inicioDay]);
  const fechaFin = useMemo(() => buildIsoDate(finYear, finMonth, finDay), [finYear, finMonth, finDay]);

  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const [templateHtml, setTemplateHtml] = useState("");
  const [campoMasivo, setCampoMasivo] = useState<"n_caja" | "n_tomo">("n_caja");
  const [valorMasivo, setValorMasivo] = useState("");
  const [actualizandoMasivo, setActualizandoMasivo] = useState(false);

  useEffect(() => {
    let active = true;

    const cargarTemplate = async () => {
      try {
        const response = await fetch("/formatos/formato_partes.html", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        if (active) setTemplateHtml(html);
      } catch {
        if (active) {
          setTemplateHtml("");
          setNotification({ message: "No se pudo cargar el template formato_partes.html", type: "error" });
        }
      }
    };

    void cargarTemplate();

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
          .from(sourceTable)
          .select("fecha_cierre")
          .not("fecha_cierre", "is", null)
          .order("fecha_cierre", { ascending: false })
          .range(from, to);

        if (error) break;

        const chunk = (data || []) as GenericRow[];
        chunk.forEach((row) => {
          const normalized = normalizeDate(toText(row.fecha_cierre));
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
      setAniosDisponibles(finalYears);
      const defaultYear = finalYears[0];
      setAnioFiltro((prev) => prev || defaultYear);
      setInicioYear((prev) => prev || defaultYear);
      setFinYear((prev) => prev || defaultYear);
    };

    void loadYears();

    return () => {
      active = false;
    };
  }, [sourceTable]);

  const filtrarPorMes = async () => {
    const range = getMonthDateRange(anioFiltro, mesFiltro);
    if (!range) {
      setNotification({ message: "Selecciona mes y año válidos.", type: "info" });
      return;
    }

    setLoading(true);
    const PAGE_SIZE = 1000;
    let from = 0;
    const allRows: GenericRow[] = [];

    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from(sourceTable)
        .select("*")
        .gte("fecha_cierre", range.firstDay)
        .lte("fecha_cierre", range.lastDay)
        .order("fecha_cierre", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (error) {
        setLoading(false);
        setNotification({ message: `No se pudo filtrar por mes: ${error.message}`, type: "error" });
        return;
      }

      const chunk = (data || []) as GenericRow[];
      allRows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    setRows(sortRowsByFechaAndExpediente(allRows));
    setFiltroAplicado(true);
    setLoading(false);
  };

  const filtrarTotal = async () => {
    if (!fechaInicio && !fechaFin) {
      setNotification({ message: "Selecciona fecha desde o hasta para filtrar.", type: "info" });
      return;
    }
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
      setNotification({ message: "La fecha desde no puede ser mayor a la fecha hasta.", type: "error" });
      return;
    }

    setLoading(true);
    const PAGE_SIZE = 1000;
    let from = 0;
    const allRows: GenericRow[] = [];

    while (true) {
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from(sourceTable)
        .select("*")
        .order("fecha_cierre", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);

      if (fechaInicio) query = query.gte("fecha_cierre", fechaInicio);
      if (fechaFin) query = query.lte("fecha_cierre", fechaFin);

      const { data, error } = await query;
      if (error) {
        setLoading(false);
        setNotification({ message: `No se pudo filtrar total: ${error.message}`, type: "error" });
        return;
      }

      const chunk = (data || []) as GenericRow[];
      allRows.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    setRows(sortRowsByFechaAndExpediente(allRows));
    setFiltroAplicado(true);
    setLoading(false);
  };

  const resetResultados = () => {
    setRows([]);
    setFiltroAplicado(false);
  };

  const actualizarCampoMasivo = async () => {
    if (!filtroAplicado || rows.length === 0) {
      setNotification({ message: "Primero filtra datos para actualizar n_caja o n_tomo.", type: "info" });
      return;
    }

    const valor = valorMasivo.trim();
    if (!valor) {
      setNotification({ message: "Ingresa el valor a aplicar.", type: "info" });
      return;
    }

    const rowsConId = rows.filter((row) => row.id !== null && row.id !== undefined);
    if (rowsConId.length === 0) {
      setNotification({ message: "No se encontraron IDs válidos para actualizar.", type: "error" });
      return;
    }

    setActualizandoMasivo(true);

    try {
      for (const row of rowsConId) {
        const rowId = row.id as string | number;
        const { error } = await supabase
          .from(sourceTable)
          .update({ [campoMasivo]: valor })
          .eq("id", rowId);

        if (error) {
          throw new Error(error.message);
        }
      }

      setRows((prev) => prev.map((row) => ({ ...row, [campoMasivo]: valor })));
      setNotification({
        message: `Se actualizó ${campoMasivo} en ${rowsConId.length} registro(s). Los cambios quedan guardados en la base.`,
        type: "success",
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Error desconocido";
      setNotification({ message: `No se pudo actualizar en bloque: ${msg}`, type: "error" });
    } finally {
      setActualizandoMasivo(false);
    }
  };

  const descargarExcelFormato = () => {
    if (rows.length === 0) {
      setNotification({ message: "No hay datos filtrados para exportar.", type: "info" });
      return;
    }

    const excelRows = rows.map((row) => ({
      serie: toText(row.serie),
      "N° CAJA": toText(row.n_caja),
      expediente: toText(row.expediente),
      n_tomo: toText(row.n_tomo),
      descripcion: toText(row.descripcion),
      fecha_apertura: toText(row.fecha_apertura),
      fecha_cierre: toText(row.fecha_cierre),
      n_fojas: toText(row.n_fojas),
      destino_final: toText(row.destino_final),
      soporte: toText(row.soporte),
      ubicacion: toText(row.ubicacion),
      observaciones: toText(row.observaciones),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BASE_PARTES");

    worksheet["!cols"] = [
      { wch: 24 },
      { wch: 12 },
      { wch: 18 },
      { wch: 12 },
      { wch: 60 },
      { wch: 14 },
      { wch: 14 },
      { wch: 10 },
      { wch: 16 },
      { wch: 12 },
      { wch: 18 },
      { wch: 24 },
    ];

    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r, c });
        if (!worksheet[cellAddress]) {
          worksheet[cellAddress] = { t: "s", v: "" };
        }

        const isHeader = r === 0;
        const isDateColumn = c === 5 || c === 6;
        if (!isHeader) {
          const excelSerial = isDateColumn ? isoDateToExcelSerial(String(worksheet[cellAddress].v ?? "")) : null;
          if (excelSerial !== null) {
            worksheet[cellAddress].t = "n";
            worksheet[cellAddress].v = excelSerial;
            (worksheet[cellAddress] as XLSX.CellObject & { z?: string }).z = "yyyy-mm-dd";
          } else {
            worksheet[cellAddress].t = "s";
            worksheet[cellAddress].v = String(worksheet[cellAddress].v ?? "");
            (worksheet[cellAddress] as XLSX.CellObject & { z?: string }).z = "@";
          }
        }
        worksheet[cellAddress].s = {
          font: {
            name: "Arial",
            sz: isHeader ? 11 : 10,
            bold: isHeader,
            color: { rgb: isHeader ? "FFFFFF" : "000000" },
          },
          alignment: {
            horizontal: c === 4 || c === 11 ? "left" : "center",
            vertical: "center",
            wrapText: true,
          },
          fill: {
            fgColor: { rgb: isHeader ? "01376D" : "FFFFFF" },
          },
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    }

    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `BASE_PARTES_${title.toUpperCase().replace(/\s+/g, "_")}_${stamp}.xlsx`);
  };

  const imprimirFormatoMensual = () => {
    if (rows.length === 0) {
      setNotification({ message: "No hay datos para imprimir.", type: "info" });
      return;
    }

    if (activeOption !== "por_mes") {
      setNotification({ message: "Este formato se imprime por mes. Usa la opción Base por mes.", type: "info" });
      return;
    }

    if (!templateHtml.trim()) {
      setNotification({ message: "No se encontró el template formato_partes.html para imprimir.", type: "error" });
      return;
    }

    const normalizedRows = rows
      .map((row) => ({
        ...row,
        _fechaCierreNorm: normalizeDate(toText(row.fecha_cierre)),
      }))
      .filter((row) => row._fechaCierreNorm)
      .sort((a, b) => String(a._fechaCierreNorm).localeCompare(String(b._fechaCierreNorm)));

    if (normalizedRows.length === 0) {
      setNotification({ message: "No hay fechas de cierre válidas para construir el formato mensual.", type: "info" });
      return;
    }

    const fechaApertura = String(normalizedRows[0]._fechaCierreNorm);
    const fechaCierre = String(normalizedRows[normalizedRows.length - 1]._fechaCierreNorm);

    const monthFromFilter = mesFiltro ? Number(mesFiltro) : NaN;
    const monthFromFirstRow = Number(fechaApertura.slice(5, 7));
    const expedienteMensual = Number.isFinite(monthFromFilter) && monthFromFilter > 0 ? monthFromFilter : monthFromFirstRow;

    const totalFojas = rows.reduce((acc, row) => {
      const raw = toText(row.n_fojas).trim();
      if (!raw) return acc;
      const parsed = Number(raw.replace(/,/g, ""));
      return Number.isFinite(parsed) ? acc + parsed : acc;
    }, 0);

    const tomo = getMostFrequentTomo(rows);

    const html = replacePartesTemplateTokens(templateHtml, {
      descripcion: "PARTES POLICIALES DE DETENCIONES Y APREHENSIONES EN DELITO FLAGRANTE",
      expediente: String(expedienteMensual || ""),
      apertura: toDisplayDate(fechaApertura),
      cierre: toDisplayDate(fechaCierre),
      fojas: String(totalFojas),
      tomo,
    });

    const ventana = window.open("", "_blank", "width=1200,height=800");
    if (!ventana) {
      setNotification({ message: "No se pudo abrir la ventana de impresión.", type: "error" });
      return;
    }

    ventana.document.write(html);
    ventana.document.close();
    ventana.focus();
    ventana.onload = () => {
      ventana.print();
      ventana.close();
    };
  };

  const hint = activeOption === "por_mes"
    ? "Selecciona mes y año, luego presiona Filtrar por mes."
    : "Selecciona rango de fechas y presiona Filtrar total.";

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
          onClick={() => {
            setActiveOption("por_mes");
            resetResultados();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeOption === "por_mes" ? "bg-cyan-500/20 text-cyan-200" : "text-white/40 hover:text-white"
          }`}
        >
          1.- Base por mes
        </button>
        <button
          onClick={() => {
            setActiveOption("total");
            resetResultados();
          }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeOption === "total" ? "bg-cyan-500/20 text-cyan-200" : "text-white/40 hover:text-white"
          }`}
        >
          2.- Base total
        </button>
        <button
          onClick={descargarExcelFormato}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-600 text-white hover:bg-emerald-500"
        >
          Descargar Excel Formato
        </button>
        <button
          onClick={imprimirFormatoMensual}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white hover:bg-indigo-500"
        >
          Imprimir formato mensual
        </button>
      </div>

      {activeOption === "por_mes" && (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Base por mes</h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Mes (fecha_cierre)</label>
              <select
                value={mesFiltro}
                onChange={(e) => {
                  setMesFiltro(e.target.value);
                  resetResultados();
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              >
                <option value="" className="bg-black text-white">Seleccionar</option>
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value} className="bg-black text-white">{month.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Año (fecha_cierre)</label>
              <select
                value={anioFiltro}
                onChange={(e) => {
                  setAnioFiltro(e.target.value);
                  resetResultados();
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              >
                {aniosDisponibles.map((year) => (
                  <option key={year} value={year} className="bg-black text-white">
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Total de filas</label>
              <div className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-bold text-cyan-300 flex items-center h-10">
                {rows.length}
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => void filtrarPorMes()}
                disabled={loading}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold transition-all bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                {loading ? "Filtrando..." : "Filtrar por mes"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Campo</label>
              <select
                value={campoMasivo}
                onChange={(e) => setCampoMasivo(e.target.value as "n_caja" | "n_tomo")}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              >
                <option value="n_caja" className="bg-black text-white">N° CAJA</option>
                <option value="n_tomo" className="bg-black text-white">N° TOMO</option>
              </select>
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Valor a aplicar</label>
              <input
                type="text"
                value={valorMasivo}
                onChange={(e) => setValorMasivo(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
                placeholder="Ejemplo: 12"
              />
            </div>

            <div className="flex items-end md:col-span-2">
              <button
                onClick={() => void actualizarCampoMasivo()}
                disabled={actualizandoMasivo || rows.length === 0 || !filtroAplicado}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {actualizandoMasivo ? "Actualizando..." : "Actualizar en filtrados"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeOption === "total" && (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Base total</h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Desde (fecha_cierre)</label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={inicioYear}
                  onChange={(e) => {
                    setInicioYear(e.target.value);
                    resetResultados();
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-black text-white">Año</option>
                  {aniosDisponibles.map((year) => (
                    <option key={`ini-year-${year}`} value={year} className="bg-black text-white">{year}</option>
                  ))}
                </select>
                <select
                  value={inicioMonth}
                  onChange={(e) => {
                    setInicioMonth(e.target.value);
                    resetResultados();
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
                    resetResultados();
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
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Hasta (fecha_cierre)</label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={finYear}
                  onChange={(e) => {
                    setFinYear(e.target.value);
                    resetResultados();
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black px-2 py-2 text-sm text-white outline-none"
                >
                  <option value="" className="bg-black text-white">Año</option>
                  {aniosDisponibles.map((year) => (
                    <option key={`fin-year-${year}`} value={year} className="bg-black text-white">{year}</option>
                  ))}
                </select>
                <select
                  value={finMonth}
                  onChange={(e) => {
                    setFinMonth(e.target.value);
                    resetResultados();
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
                    resetResultados();
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

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Total de filas</label>
              <div className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-bold text-cyan-300 flex items-center h-10">
                {rows.length}
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => void filtrarTotal()}
                disabled={loading}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold transition-all bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                {loading ? "Filtrando..." : "Filtrar total"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Campo</label>
              <select
                value={campoMasivo}
                onChange={(e) => setCampoMasivo(e.target.value as "n_caja" | "n_tomo")}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              >
                <option value="n_caja" className="bg-black text-white">N° CAJA</option>
                <option value="n_tomo" className="bg-black text-white">N° TOMO</option>
              </select>
            </div>

            <div className="space-y-1 md:col-span-3">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Valor a aplicar</label>
              <input
                type="text"
                value={valorMasivo}
                onChange={(e) => setValorMasivo(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
                placeholder="Ejemplo: 12"
              />
            </div>

            <div className="flex items-end md:col-span-2">
              <button
                onClick={() => void actualizarCampoMasivo()}
                disabled={actualizandoMasivo || rows.length === 0 || !filtroAplicado}
                className="w-full px-4 py-2 rounded-xl text-xs font-bold transition-all bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {actualizandoMasivo ? "Actualizando..." : "Actualizar en filtrados"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
        <div className="max-h-[420px] overflow-auto custom-scrollbar">
          <table className="w-full text-[10px] text-left border-collapse min-w-[90rem]">
            <thead className="sticky top-0 bg-[#01376d] text-white uppercase font-black z-10">
              <tr>
                {TABLE_HEADERS.map((header) => (
                  <th key={header.key} className="p-3 border-r border-black/30 whitespace-nowrap">
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-white/75">
              {!loading && !filtroAplicado && (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="p-6 text-center text-white/40 text-sm">
                    {hint}
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="p-6 text-center text-white/50 text-sm">
                    Cargando datos...
                  </td>
                </tr>
              )}

              {!loading && filtroAplicado && rows.length === 0 && (
                <tr>
                  <td colSpan={TABLE_HEADERS.length} className="p-6 text-center text-white/40 text-sm">
                    Sin datos para mostrar.
                  </td>
                </tr>
              )}

              {!loading && filtroAplicado && rows.map((row, idx) => (
                <tr key={`bases-${idx}`} className="border-t border-white/10 hover:bg-white/5">
                  {TABLE_HEADERS.map((header) => (
                    <td key={`${header.key}-${idx}`} className="p-3 font-mono align-top">
                      {toText(row[header.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
