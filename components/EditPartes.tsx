"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import jsPDF from "jspdf";
import Notification from "./Notification";
import ConfirmModal from "./ConfirmModal";

type ParteRow = {
  id: string | number;
  expediente?: string;
  descripcion?: string;
  n_caja?: string;
  n_tomo?: string;
  fecha_apertura?: string;
  fecha_cierre?: string;
  n_fojas?: string | number;
  destino_final?: string;
};

export default function EditPartes() {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<ParteRow[]>([]);
  const [editando, setEditando] = useState<ParteRow | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | number | null>(null);

  const handleSearch = async (valor: string) => {
    setBusqueda(valor);
    if (valor.length < 3) return setResultados([]);
    const { data } = await supabase
      .from("PARTES")
      .select("*")
      .or(`expediente.ilike.%${valor}%,descripcion.ilike.%${valor}%`)
      .limit(10);
    setResultados(data || []);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const { error } = await supabase.from("PARTES").update(editando).eq("id", editando.id);
    if (error) {
      setNotification({ message: "Error al actualizar", type: "error" });
    } else {
      setNotification({ message: "Registro actualizado", type: "success" });
      setEditando(null);
      handleSearch(busqueda);
    }
  };

  const requestEliminar = (id: string | number) => {
    setItemToDelete(id);
  };

  const confirmEliminar = async () => {
    if (!itemToDelete) return;
    const { error } = await supabase.from("PARTES").delete().eq("id", itemToDelete);
    if (error) {
      setNotification({ message: "Error al eliminar", type: "error" });
    } else {
      setNotification({ message: "Registro eliminado con éxito", type: "success" });
      handleSearch(busqueda);
    }
    setItemToDelete(null);
  };

  const generarPDF = (item: ParteRow) => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const width = doc.internal.pageSize.getWidth();

    doc.setLineWidth(0.5);
    doc.rect(10, 10, width - 20, 277);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("POLICÍA NACIONAL DEL ECUADOR", width / 2, 25, { align: "center" });
    doc.text("DIRECCIÓN NACIONAL DE INVESTIGACIÓN TÉCNICO CIENTÍFICA", width / 2, 31, { align: "center" });
    doc.text("POLICÍA JUDICIAL", width / 2, 37, { align: "center" });
    doc.line(40, 42, width - 40, 42);

    const esParte = item.descripcion?.toUpperCase().includes("PARTE");
    doc.setFontSize(18);
    doc.text(esParte ? "PARTE POLICIAL" : "INFORME DE INVESTIGACIÓN", width / 2, 60, { align: "center" });

    doc.setFontSize(11);
    const campos = [
      ["N° DE CAJA:", item.n_caja],
      ["EXPEDIENTE:", item.expediente],
      ["N° DE TOMO:", item.n_tomo],
      ["FECHA APERTURA:", item.fecha_apertura],
      ["FECHA CIERRE:", item.fecha_cierre],
      ["N° DE FOJAS:", item.n_fojas],
      ["DESTINO FINAL:", item.destino_final],
    ];

    let currentY = 85;
    campos.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label as string, 35, currentY);
      doc.setFont("helvetica", "normal");
      doc.text(String(value || ""), 80, currentY);
      currentY += 12;
    });

    doc.setFont("helvetica", "bold");
    doc.text("DESCRIPCIÓN DOCUMENTAL:", 35, 175);
    doc.setFont("helvetica", "normal");
    const splitDesc = doc.splitTextToSize(item.descripcion || "", width - 70);
    doc.text(splitDesc, 35, 183, { align: "justify" });

    doc.save(`CARATULA_${item.expediente}.pdf`);
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
      {itemToDelete && (
        <ConfirmModal
          title="Confirmar Eliminación"
          message="¿ESTÁ SEGURO? Esta acción borrará el registro de la base de datos permanentemente."
          onConfirm={confirmEliminar}
          onCancel={() => setItemToDelete(null)}
        />
      )}

      {editando ? (
        <form onSubmit={handleUpdate} className="bg-white/5 rounded-3xl p-6 border border-indigo-500/30 space-y-4 animate-in slide-in-from-right-4 duration-300">
          <h3 className="text-indigo-400 font-black text-xs uppercase tracking-widest">Modo Edición: {editando.expediente}</h3>
          <div className="grid grid-cols-2 gap-4">
            <input type="text" value={editando.n_caja || ""} onChange={(e) => setEditando({ ...editando, n_caja: e.target.value })} className="bg-white/5 p-3 rounded-xl text-xs text-white outline-none border border-white/10" placeholder="Caja" />
            <input type="text" value={editando.n_tomo || ""} onChange={(e) => setEditando({ ...editando, n_tomo: e.target.value })} className="bg-white/5 p-3 rounded-xl text-xs text-white outline-none border border-white/10" placeholder="Tomo" />
          </div>
          <textarea rows={4} value={editando.descripcion || ""} onChange={(e) => setEditando({ ...editando, descripcion: e.target.value })} className="w-full bg-white/5 p-3 rounded-xl text-xs text-white outline-none border border-white/10 resize-none" />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-indigo-600 py-3 rounded-xl font-bold text-xs uppercase">Guardar Cambios</button>
            <button type="button" onClick={() => setEditando(null)} className="px-6 bg-white/10 rounded-xl text-xs uppercase text-white">Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-4">
          <input type="text" value={busqueda} onChange={(e) => handleSearch(e.target.value)} placeholder="🔍 Buscar por expediente o descripción..." className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white outline-none focus:border-indigo-500" />
          <div className="space-y-2">
            {resultados.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 group hover:border-indigo-500/20">
                <div className="flex flex-col overflow-hidden">
                  <span className="text-[10px] font-bold text-indigo-300 font-mono">{item.expediente}</span>
                  <span className="text-[9px] text-white/40 truncate max-w-[200px] md:max-w-[400px]">{item.descripcion}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditando(item)} className="px-3 py-2 bg-white/10 rounded-lg text-[9px] font-bold uppercase hover:bg-white/20 text-white">Editar</button>
                  <button onClick={() => requestEliminar(item.id)} className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-[9px] font-bold uppercase hover:bg-red-500/20">Eliminar</button>
                  <button onClick={() => generarPDF(item)} className="px-3 py-2 bg-indigo-600 rounded-lg text-[9px] font-bold uppercase text-white">📄 PDF</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
