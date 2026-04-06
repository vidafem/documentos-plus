"use client";

interface ConfirmModalProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({ title, message, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="vision-glass w-full max-w-md rounded-[2rem] overflow-hidden flex flex-col shadow-2xl border border-white/20">
        <div className="p-6 border-b border-white/10 bg-white/5">
          <h3 className="text-lg font-bold text-amber-400">{title}</h3>
        </div>
        <div className="p-6 space-y-6">
          <p className="text-sm text-white/80">{message}</p>
          <div className="flex justify-end gap-4">
            <button 
              onClick={onCancel} 
              className="px-6 py-2 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 hover:text-white font-semibold text-xs uppercase transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={onConfirm}
              className="px-6 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase transition-all"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}