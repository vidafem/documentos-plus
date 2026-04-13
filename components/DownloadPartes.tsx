"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx-js-style";
import Notification from "./Notification";

type ParteRegistro = {
  id: string;
  expediente?: string;
  descripcion?: string;
  n_caja?: string;
  n_tomo?: string;
  fecha_apertura?: string;
  fecha_cierre?: string;
  n_fojas?: string | number;
  destino_final?: string;
  soporte?: string;
  ubicacion?: string;
  observaciones?: string;
  created_at?: string;
  serie?: string;
};

const normalizeDateValue = (value: string): string => {
  const raw = String(value || "").trim();
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

type DownloadPartesProps = {
  sourceTable?: "PARTES" | "partes_viejas";
};

export default function DownloadPartes({ sourceTable = "PARTES" }: DownloadPartesProps) {
  const [registros, setRegistros] = useState<ParteRegistro[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filtroYear, setFiltroYear] = useState("");
  const [filtroMonth, setFiltroMonth] = useState("");
  const [aniosDisponibles, setAniosDisponibles] = useState<string[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: "info" } | null>(null);

  const filtroMes = useMemo(() => (filtroYear && filtroMonth ? `${filtroYear}-${filtroMonth}` : ""), [filtroYear, filtroMonth]);

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

        const chunk = (data || []) as ParteRegistro[];
        chunk.forEach((row) => {
          const normalized = normalizeDateValue(String(row.fecha_cierre || ""));
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
      setFiltroYear((prev) => prev || finalYears[0]);
    };

    void loadYears();

    return () => {
      active = false;
    };
  }, [sourceTable]);

  const fetchRegistros = useCallback(async () => {
    let query = supabase.from(sourceTable).select("*").order("created_at", { ascending: false });
    if (filtroMes) {
      query = query.gte("fecha_cierre", `${filtroMes}-01`).lte("fecha_cierre", `${filtroMes}-31`);
    }
    const { data } = await query;
    return (data || []) as ParteRegistro[];
  }, [filtroMes, sourceTable]);

  const recargarRegistros = async () => {
    const data = await fetchRegistros();
    setRegistros(data);
  };

  useEffect(() => {
    let active = true;

    const cargar = async () => {
      const data = await fetchRegistros();
      if (!active) return;
      setRegistros(data);
    };

    void cargar();

    return () => {
      active = false;
    };
  }, [fetchRegistros]);

  const handleExportExcel = () => {
    if (registros.length === 0) {
      setNotification({ message: "No hay registros para exportar", type: "info" });
      return;
    }
    const dataToExport = selectedIds.length > 0 ? registros.filter((r) => selectedIds.includes(r.id)) : registros;

    const excelData = dataToExport.map((item) => ({
      serie: item.serie || "",
      "N° CAJA": item.n_caja || "",
      expediente: item.expediente || "",
      n_tomo: item.n_tomo || "",
      descripcion: item.descripcion || "",
      fecha_apertura: item.fecha_apertura || "",
      fecha_cierre: item.fecha_cierre || "",
      n_fojas: item.n_fojas || "",
      destino_final: item.destino_final || "",
      soporte: item.soporte || "",
      ubicacion: item.ubicacion || "",
      observaciones: item.observaciones || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
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

    XLSX.writeFile(workbook, `BASE_PARTES_${new Date().getFullYear()}.xlsx`);
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
      <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-4 animate-in fade-in duration-500">
        <div className="flex justify-between items-end">
          <div className="flex gap-4 items-end">
            <div className="w-40 space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase ml-1">Mes de Cierre</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={filtroYear} onChange={(e) => setFiltroYear(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none">
                  <option value="" className="bg-black text-white">Año</option>
                  {aniosDisponibles.map((year) => (
                    <option key={`year-${year}`} value={year} className="bg-black text-white">{year}</option>
                  ))}
                </select>
                <select value={filtroMonth} onChange={(e) => setFiltroMonth(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none">
                  <option value="" className="bg-black text-white">Mes</option>
                  {MONTH_OPTIONS.map((month) => (
                    <option key={`month-${month.value}`} value={month.value} className="bg-black text-white">{month.value}</option>
                  ))}
                </select>
              </div>
            </div>
            <button onClick={() => void recargarRegistros()} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all">⟳</button>
          </div>
          <button onClick={handleExportExcel} className="bg-green-600 hover:bg-green-500 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg transition-all active:scale-95">
            📊 Descargar Matriz Flagrancia Excel
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
          <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-[10px] text-left border-collapse">
              <thead className="sticky top-0 bg-neutral-900 text-white/30 uppercase font-black z-10">
                <tr>
                  <th className="p-3 w-10 text-center"><input type="checkbox" onChange={() => setSelectedIds(selectedIds.length === registros.length ? [] : registros.map((r) => r.id))} /></th>
                  <th className="p-3">Expediente</th>
                  <th className="p-3">Descripción</th>
                  <th className="p-3 text-right">Fojas</th>
                </tr>
              </thead>
              <tbody className="text-white/60">
                {registros.map((item) => (
                  <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds((prev) => prev.includes(item.id) ? prev.filter((i) => i !== item.id) : [...prev, item.id])} /></td>
                    <td className="p-3 font-mono text-indigo-300">{item.expediente}</td>
                    <td className="p-3 truncate max-w-xs">{item.descripcion}</td>
                    <td className="p-3 text-right">{item.n_fojas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
