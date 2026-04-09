"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

type FlagranciaRow = Record<string, string | number | null>;

export default function ParaFirmarModule() {
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [registros, setRegistros] = useState<FlagranciaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const toSlashDate = (iso: string) => (iso ? iso.replace(/-/g, "/") : "");

  const formatDisplayDate = (iso: string) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  const buscar = async () => {
    if (!fechaDesde || !fechaHasta) {
      setNotification({ message: "Selecciona fecha inicio y fecha fin", type: "info" });
      return;
    }
    if (fechaDesde > fechaHasta) {
      setNotification({ message: "La fecha inicio no puede ser mayor que la fecha fin", type: "error" });
      return;
    }

    setLoading(true);
    setBuscado(false);

    const desde = toSlashDate(fechaDesde);
    const hasta = toSlashDate(fechaHasta);

    const PAGE_SIZE = 1000;
    let from = 0;
    const allRows: FlagranciaRow[] = [];

    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("FLAGRANCIA")
        .select("F_RECEPCION, IF, DETENIDO, APELLIDOS_Y_NOMBRES_DEL_FISCAL, UNIDAD_ESPECIALIZADA_DE_FISCALIA, PERITO")
        .gte("F_RECEPCION", desde)
        .lte("F_RECEPCION", hasta)
        .order("F_RECEPCION", { ascending: true })
        .range(from, to);

      if (error) {
        setLoading(false);
        setNotification({ message: `Error al consultar: ${error.message}`, type: "error" });
        return;
      }

      const bloque = (data || []) as FlagranciaRow[];
      allRows.push(...bloque);

      if (bloque.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    setRegistros(allRows);
    setLoading(false);
    setBuscado(true);

    if (allRows.length === 0) {
      setNotification({ message: "No se encontraron registros en ese rango de fechas.", type: "info" });
    }
  };

  const imprimir = () => {
    if (!printRef.current) return;

    const contenido = printRef.current.innerHTML;
    const ventana = window.open("", "_blank", "width=1000,height=700");
    if (!ventana) {
      setNotification({ message: "No se pudo abrir la ventana de impresión. Verifica que no esté bloqueada.", type: "error" });
      return;
    }

    ventana.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Para Firmar - Delegaciones</title>
  <style>
    @page {
      size: A4 landscape;
      margin: 15mm 10mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, sans-serif;
      font-size: 9px;
      color: #000;
    }
    .print-header {
      text-align: center;
      margin-bottom: 8px;
    }
    .print-header h1 {
      font-size: 14px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .print-header p {
      font-size: 10px;
      color: #333;
      margin-top: 2px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
    }
    thead tr {
      background-color: #1a3a5c;
      color: #fff;
    }
    thead th {
      border: 1px solid #000;
      padding: 4px 5px;
      text-align: center;
      font-size: 8.5px;
      font-weight: bold;
      text-transform: uppercase;
    }
    tbody tr:nth-child(even) {
      background-color: #f0f4f8;
    }
    tbody td {
      border: 1px solid #555;
      padding: 3px 5px;
      font-size: 8.5px;
      vertical-align: middle;
    }
    .td-firma {
      width: 40mm;
      min-width: 40mm;
      height: 14mm;
      border: 2px solid #000 !important;
    }
    .num-col { text-align: center; width: 22px; }
    .fecha-col { text-align: center; white-space: nowrap; }
    .if-col { text-align: center; white-space: nowrap; }
  </style>
</head>
<body>
  ${contenido}
</body>
</html>`);

    ventana.document.close();
    ventana.focus();
    ventana.onload = () => {
      ventana.print();
      ventana.close();
    };
  };

  const labelDesde = fechaDesde ? formatDisplayDate(fechaDesde) : "—";
  const labelHasta = fechaHasta ? formatDisplayDate(fechaHasta) : "—";

  return (
    <div className="flex flex-col gap-6">
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}

      {/* Controles */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/60 font-semibold uppercase tracking-wider">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="bg-white/10 border border-white/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-white/60 font-semibold uppercase tracking-wider">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="bg-white/10 border border-white/20 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        <button
          onClick={buscar}
          disabled={loading}
          className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
        >
          {loading ? "Buscando..." : "Buscar"}
        </button>
        {buscado && registros.length > 0 && (
          <button
            onClick={imprimir}
            className="px-5 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2"
          >
            <span>🖨️</span> Imprimir ({registros.length})
          </button>
        )}
      </div>

      {/* Tabla en pantalla */}
      {buscado && registros.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 overflow-x-auto">
          <p className="text-white/50 text-xs mb-3 font-semibold uppercase tracking-wider">
            {registros.length} registro{registros.length !== 1 ? "s" : ""} encontrado{registros.length !== 1 ? "s" : ""} · {labelDesde} — {labelHasta}
          </p>
          <table className="min-w-full text-xs text-white/80 border-collapse">
            <thead>
              <tr className="bg-[#01376d]">
                <th className="px-2 py-2 border border-white/20 text-center">#</th>
                <th className="px-2 py-2 border border-white/20 text-center whitespace-nowrap">F_RECEPCION</th>
                <th className="px-2 py-2 border border-white/20 text-center">IF</th>
                <th className="px-2 py-2 border border-white/20">DETENIDO</th>
                <th className="px-2 py-2 border border-white/20">FISCAL</th>
                <th className="px-2 py-2 border border-white/20">UNIDAD FISCALÍA</th>
                <th className="px-2 py-2 border border-white/20">PERITO</th>
                <th className="px-2 py-2 border border-white/20 text-center">FIRMA</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-white/5" : "bg-white/0"}>
                  <td className="px-2 py-1 border border-white/10 text-center">{i + 1}</td>
                  <td className="px-2 py-1 border border-white/10 text-center whitespace-nowrap">{String(row["F_RECEPCION"] ?? "")}</td>
                  <td className="px-2 py-1 border border-white/10 text-center">{String(row["IF"] ?? "")}</td>
                  <td className="px-2 py-1 border border-white/10">{String(row["DETENIDO"] ?? "")}</td>
                  <td className="px-2 py-1 border border-white/10">{String(row["APELLIDOS_Y_NOMBRES_DEL_FISCAL"] ?? "")}</td>
                  <td className="px-2 py-1 border border-white/10">{String(row["UNIDAD_ESPECIALIZADA_DE_FISCALIA"] ?? "")}</td>
                  <td className="px-2 py-1 border border-white/10">{String(row["PERITO"] ?? "")}</td>
                  <td className="px-2 py-1 border-2 border-white/30 w-24 h-8"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Contenido oculto para impresión */}
      <div style={{ display: "none" }}>
        <div ref={printRef}>
          <div className="print-header">
            <h1>DELEGACIONES</h1>
            <p>Período: {labelDesde} al {labelHasta}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th className="num-col">#</th>
                <th className="fecha-col">F. RECEPCIÓN</th>
                <th className="if-col">IF</th>
                <th>DETENIDO</th>
                <th>APELLIDOS Y NOMBRES DEL FISCAL</th>
                <th>UNIDAD ESPECIALIZADA DE FISCALÍA</th>
                <th>PERITO</th>
                <th className="td-firma">FIRMA</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((row, i) => (
                <tr key={i}>
                  <td className="num-col">{i + 1}</td>
                  <td className="fecha-col">{String(row["F_RECEPCION"] ?? "")}</td>
                  <td className="if-col">{String(row["IF"] ?? "")}</td>
                  <td>{String(row["DETENIDO"] ?? "")}</td>
                  <td>{String(row["APELLIDOS_Y_NOMBRES_DEL_FISCAL"] ?? "")}</td>
                  <td>{String(row["UNIDAD_ESPECIALIZADA_DE_FISCALIA"] ?? "")}</td>
                  <td>{String(row["PERITO"] ?? "")}</td>
                  <td className="td-firma"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
