"use client";

import { useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

type FlagranciaRow = Record<string, string | number | null>;

const FLAGRANCIA_HEADERS = [
  "id",
  "MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES",
  "IF",
  "ZONA_(SEGÚN_SENPLADES)",
  "PROVINCIA",
  "CANTÓN",
  "COD._DISTRITO",
  "DISTRITO",
  "GRADO",
  "PERITO",
  "TIPO_DE_DELITO",
  "DELITO_TIPIFICADO_EN_DELEGACION",
  "DELITO_DESAGREGACION_POLICIA_JUDICIAL",
  "FECHA_DE_LA_INFRACIÓN_DELITO",
  "DETENIDO",
  "CONDICIÓN_DEL_INFRACTOR_INVOLUCRADO",
  "APELLIDOS_Y_NOMBRES_DEL_FISCAL",
  "UNIDAD_ESPECIALIZADA_DE_FISCALIA",
  "F_DELEGACION",
  "F_RECEPCION",
  "FECHA_DE_RECEPCION_POR_PARTE_AGENTE_INVESTIGADOR",
  "Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE",
  "PLAZO_DIAS",
  "N_ART",
  "QUE_ART_CUMPLIO_DENTRO_DEL_PLAZO",
  "CUMPLIMIENTO_PARCIAL",
  "CUMPLIMIENTO_TOTAL",
  "F_CUMPLIMIENTO",
  "OFICIO_DESCARGO",
  "RECONOCIMIENTOS",
  "INFORME_O_DESCARGO",
  "FUENTE_DE_INFORMACIÓN",
  "FECHA_ORIGINAL_DEL_OFICIO",
  "EXTRACTO",
  "N_INFORME",
  "FOJAS",
] as const;

export default function DownloadFlagranciaModule() {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [registros, setRegistros] = useState<FlagranciaRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const toSlashDate = (isoDate: string) => isoDate ? isoDate.replace(/-/g, "/") : "";

  const buscarPorIntervalo = async () => {
    if (!fechaInicio || !fechaFin) {
      setNotification({ message: "Selecciona fecha inicio y fecha fin", type: "info" });
      return;
    }
    if (fechaInicio > fechaFin) {
      setNotification({ message: "La fecha inicio no puede ser mayor que la fecha fin", type: "error" });
      return;
    }

    setLoading(true);

    const fechaInicioDb = toSlashDate(fechaInicio);
    const fechaFinDb = toSlashDate(fechaFin);

    const PAGE_SIZE = 1000;
    let from = 0;
    const allRows: FlagranciaRow[] = [];

    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("FLAGRANCIA")
        .select("*")
        .gte("F_RECEPCION", fechaInicioDb)
        .lte("F_RECEPCION", fechaFinDb)
        .order("id", { ascending: true })
        .range(from, to);

      if (error) {
        setLoading(false);
        setNotification({ message: `Error al consultar FLAGRANCIA: ${error.message}`, type: "error" });
        return;
      }

      const bloque = (data || []) as FlagranciaRow[];
      allRows.push(...bloque);

      if (bloque.length < PAGE_SIZE) {
        break;
      }
      from += PAGE_SIZE;
    }

    setRegistros(allRows);
    setLoading(false);

    if (allRows.length === 0) {
      setNotification({ message: "No hay registros en ese intervalo de F_RECEPCION", type: "info" });
      return;
    }

    setNotification({ message: `Se encontraron ${allRows.length} registros`, type: "success" });
  };

  const descargarExcel = () => {
    if (registros.length === 0) {
      setNotification({ message: "Primero consulta un intervalo con datos", type: "info" });
      return;
    }

    const excelData = registros.map((row) => {
      const fila: Record<string, string> = {};
      FLAGRANCIA_HEADERS.forEach((header) => {
        fila[header] = String(row[header] ?? "");
      });
      return fila;
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData, { header: [...FLAGRANCIA_HEADERS] });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "FLAGRANCIA");

    // Ancho uniforme de 19 para todas las columnas.
    worksheet["!cols"] = FLAGRANCIA_HEADERS.map(() => ({ wch: 19 }));

    // Columnas cuyo contenido debe salir con letras rojas.
    const RED_COLUMNS: string[] = [
      "ZONA_(SEGÚN_SENPLADES)",
      "PROVINCIA",
      "CANTÓN",
      "TIPO_DE_DELITO",
      "DELITO_TIPIFICADO_EN_DELEGACION",
      "DISTRITO",
    ];
    const redColIndexes = new Set(
      RED_COLUMNS.map((col) => FLAGRANCIA_HEADERS.indexOf(col as typeof FLAGRANCIA_HEADERS[number])).filter((i) => i >= 0)
    );

    const range = XLSX.utils.decode_range(worksheet["!ref"] || `A1:A1`);

    // Estilos de encabezado: fondo amarillo, texto negro, centrado.
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const headerCellAddr = XLSX.utils.encode_cell({ r: 0, c });
      const headerCell = worksheet[headerCellAddr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined;
      if (headerCell) {
        headerCell.s = {
          font: { bold: true, color: { rgb: "FF000000" } },
          fill: { fgColor: { rgb: "FFFFFF00" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      }
    }

    // Fuerza texto + alineación derecha en datos; rojo en columnas marcadas.
    for (let r = 1; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[addr] as XLSX.CellObject & { s?: Record<string, unknown>; z?: string } | undefined;
        if (cell) {
          cell.t = "s";
          cell.v = String(cell.v ?? "");
          cell.z = "@";
          cell.s = {
            font: redColIndexes.has(c)
              ? { color: { rgb: "FFFF0000" } }
              : { color: { rgb: "FF000000" } },
            alignment: { horizontal: "left", vertical: "center" },
          };
        }
      }
    }

    // Columna IF: texto azul + negrita (sobreescribe el rojo si coincide).
    const ifColIndex = FLAGRANCIA_HEADERS.indexOf("IF");
    if (ifColIndex >= 0) {
      for (let r = 1; r <= range.e.r; r += 1) {
        const ifCellAddr = XLSX.utils.encode_cell({ r, c: ifColIndex });
        const ifCell = worksheet[ifCellAddr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined;
        if (ifCell) {
          ifCell.s = {
            font: { color: { rgb: "FF1E40AF" }, bold: true },
            alignment: { horizontal: "left", vertical: "center" },
          };
        }
      }
    }

    XLSX.writeFile(workbook, `FLAGRANCIA_F_RECEPCION_${fechaInicio}_a_${fechaFin}.xlsx`);
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

      <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-5 animate-in fade-in duration-500">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">F. recepcion inicio</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/40 uppercase">F. recepcion fin</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
              />
            </div>

            <button
              onClick={buscarPorIntervalo}
              disabled={loading}
              className="h-[42px] mt-auto bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed px-4 rounded-xl text-[10px] font-bold uppercase"
            >
              {loading ? "Consultando..." : "Buscar Intervalo"}
            </button>
          </div>

          <button
            onClick={descargarExcel}
            className="bg-green-600 hover:bg-green-500 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg transition-all active:scale-95"
          >
            Descargar Excel Completo
          </button>
        </div>

        <div className="text-xs text-white/60">
          Registros cargados: <span className="font-bold text-white">{registros.length}</span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/5 bg-black/20">
          <div className="max-h-[420px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-[10px] text-left border-collapse">
              <thead className="sticky top-0 bg-neutral-900 text-white/30 uppercase font-black z-10">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">IF</th>
                  <th className="p-3">F_RECEPCION</th>
                  <th className="p-3">DETENIDO</th>
                  <th className="p-3">DELITO</th>
                </tr>
              </thead>
              <tbody className="text-white/70">
                {registros.map((item, idx) => (
                  <tr key={`${item.id || idx}`} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-3 font-mono">{String(item.id ?? "")}</td>
                    <td className="p-3 font-mono text-indigo-300">{String(item["IF"] ?? "")}</td>
                    <td className="p-3 font-mono">{String(item["F_RECEPCION"] ?? "")}</td>
                    <td className="p-3">{String(item["DETENIDO"] ?? "")}</td>
                    <td className="p-3">{String(item["DELITO_DESAGREGACION_POLICIA_JUDICIAL"] ?? "")}</td>
                  </tr>
                ))}
                {registros.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-white/40">
                      Selecciona un rango de F_RECEPCION y presiona Buscar Intervalo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
