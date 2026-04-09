"use client";

import { useMemo, useState } from "react";
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

export default function BasesPartesModule({ sourceTable, title }: BasesPartesModuleProps) {
  const [activeOption, setActiveOption] = useState<ActiveOption>("por_mes");
  const [rows, setRows] = useState<GenericRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroAplicado, setFiltroAplicado] = useState(false);

  const [mesFiltro, setMesFiltro] = useState("");
  const [anioFiltro, setAnioFiltro] = useState(String(new Date().getFullYear()));

  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");

  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const aniosDisponibles = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const baseYear = 2020;
    return Array.from({ length: currentYear - baseYear + 2 }, (_, idx) => String(currentYear + 1 - idx));
  }, []);

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

    setRows(allRows);
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

    setRows(allRows);
    setFiltroAplicado(true);
    setLoading(false);
  };

  const resetResultados = () => {
    setRows([]);
    setFiltroAplicado(false);
  };

  const imprimirListado = () => {
    if (rows.length === 0) {
      setNotification({ message: "No hay datos para imprimir.", type: "info" });
      return;
    }

    const periodo = activeOption === "por_mes"
      ? `Mes: ${mesFiltro || "-"} / Año: ${anioFiltro || "-"}`
      : `Desde: ${fechaInicio || "-"}  Hasta: ${fechaFin || "-"}`;

    const tableHead = TABLE_HEADERS.map((h) => `<th>${h.label}</th>`).join("");
    const tableBody = rows
      .map((row) => {
        const cols = TABLE_HEADERS.map((h) => `<td>${toText(row[h.key])}</td>`).join("");
        return `<tr>${cols}</tr>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${title} - Bases Partes</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      color: #111;
      font-size: 8px;
    }
    .header {
      text-align: center;
      margin-bottom: 8px;
    }
    .header h1 {
      margin: 0;
      font-size: 14px;
      text-transform: uppercase;
    }
    .header p {
      margin: 2px 0 0;
      font-size: 9px;
      color: #333;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      border: 1px solid #333;
      padding: 3px 4px;
      vertical-align: top;
      word-break: break-word;
    }
    th {
      background: #1e3a5f;
      color: #fff;
      font-size: 7px;
      text-transform: uppercase;
      text-align: center;
    }
    tr:nth-child(even) td {
      background: #f4f7fb;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${title} - Bases Partes</h1>
    <p>${periodo}</p>
    <p>Total registros: ${rows.length}</p>
  </div>
  <table>
    <thead>
      <tr>${tableHead}</tr>
    </thead>
    <tbody>
      ${tableBody}
    </tbody>
  </table>
</body>
</html>`;

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
          onClick={imprimirListado}
          className="px-4 py-2 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white hover:bg-indigo-500"
        >
          Imprimir listado
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
        </div>
      )}

      {activeOption === "total" && (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">Base total</h3>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Desde (fecha_cierre)</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => {
                  setFechaInicio(e.target.value);
                  resetResultados();
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">Hasta (fecha_cierre)</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => {
                  setFechaFin(e.target.value);
                  resetResultados();
                }}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none"
              />
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
