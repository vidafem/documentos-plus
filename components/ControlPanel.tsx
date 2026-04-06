"use client";

interface ControlPanelProps {
  activeView: string;
  onAdd: () => void;
  onEdit: () => void;
  onDownload: () => void;
  onDelegacionesFlagrancia: () => void;
  showDelegacionesFlagrancia: boolean;
}

export default function ControlPanel({
  activeView,
  onAdd,
  onEdit,
  onDownload,
  onDelegacionesFlagrancia,
  showDelegacionesFlagrancia,
}: ControlPanelProps) {
  return (
    <div className="flex gap-2 p-1 bg-black/20 rounded-2xl w-fit border border-white/5">
      <button onClick={onAdd} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeView === "add" ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white"}`}>
        <span>➕</span> Nuevo Registro
      </button>
      <button onClick={onEdit} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeView === "edit" ? "bg-white/10 text-white shadow-lg" : "text-white/40 hover:text-white"}`}>
        <span>✏️</span> Editar
      </button>
      <button onClick={onDownload} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeView === "download" ? "bg-green-500/20 text-green-400 shadow-lg" : "text-white/40 hover:text-green-400"}`}>
        <span>📊</span> Reportes / Excel
      </button>
      {showDelegacionesFlagrancia && (
        <button onClick={onDelegacionesFlagrancia} className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${activeView === "delegaciones_flagrancia" ? "bg-orange-500/20 text-orange-300 shadow-lg" : "text-white/40 hover:text-orange-300"}`}>
          <span>📁</span> Delegaciones Flagrancia
        </button>
      )}
    </div>
  );
}