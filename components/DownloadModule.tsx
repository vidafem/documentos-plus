"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import * as XLSX from "xlsx";
import Notification from "./Notification";

export default function DownloadModule() {
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filtroMes, setFiltroMes] = useState("");
  const [notification, setNotification] = useState<{ message: string; type: 'info' } | null>(null);

  const fetchRegistros = async () => {
    setLoading(true);
    let query = supabase.from("delegaciones_viejas").select("*").order("created_at", { ascending: false });
    if (filtroMes) {
      query = query.gte("fecha_cierre", `${filtroMes}-01`).lte("fecha_cierre", `${filtroMes}-31`);
    }
    const { data } = await query;
    setRegistros(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchRegistros(); }, [filtroMes]);

  const handleExportExcel = () => {
    if (registros.length === 0) {
      setNotification({ message: "No hay registros para exportar", type: 'info' });
      return;
    }
    const dataToExport = selectedIds.length > 0 ? registros.filter(r => selectedIds.includes(r.id)) : registros;

    // COLUMNAS IDÉNTICAS A TU MATRIZ_FLAGRANCIA
    const excelData = dataToExport.map(item => ({
      "SERIE DOCUMENTAL": item.serie || "PROCEDIMIENTOS INVESTIGATIVOS",
      "SUB-SERIE DOCUMENTAL": "POR DISPOSICIÓN JUDICIAL",
      "Nº CAJA": item.n_caja,
      "EXPEDIENTE": item.expediente,
      "Nº TOMO": item.n_tomo,
      "DESCRIPCIÓN DOCUMENTAL": item.descripcion,
      "FECHA APERTURA": item.fecha_apertura,
      "FECHA CIERRE": item.fecha_cierre,
      "Nº FOJAS": item.n_fojas,
      "DESTINO FINAL": item.destino_final,
      "SOPORTE": item.soporte || "Físico",
      "UBICACIÓN TOPOGRÁFICA": item.ubicacion || "",
      "OBSERVACIONES": item.observaciones || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MATRIZ");
    
    // Ajuste de anchos para que se vea igual al tuyo
    worksheet["!cols"] = [
      {wch: 25}, {wch: 25}, {wch: 8}, {wch: 25}, {wch: 8}, 
      {wch: 60}, {wch: 15}, {wch: 15}, {wch: 8}, {wch: 15}, 
      {wch: 10}, {wch: 20}, {wch: 20}
    ];

    XLSX.writeFile(workbook, `MATRIZ_FLAGRANCIA_${new Date().getFullYear()}.xlsx`);
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
              <input type="month" value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none" />
            </div>
            <button onClick={fetchRegistros} className="bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl text-[10px] font-bold uppercase transition-all">⟳</button>
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
                  <th className="p-3 w-10 text-center"><input type="checkbox" onChange={() => setSelectedIds(selectedIds.length === registros.length ? [] : registros.map(r => r.id))} /></th>
                  <th className="p-3">Expediente</th>
                  <th className="p-3">Descripción</th>
                  <th className="p-3 text-right">Fojas</th>
                </tr>
              </thead>
              <tbody className="text-white/60">
                {registros.map((item) => (
                  <tr key={item.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-3 text-center"><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => setSelectedIds(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id])} /></td>
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