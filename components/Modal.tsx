"use client";

export default function Modal({ title, children, onClose }: { title: string, children: React.ReactNode, onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="vision-glass w-full max-w-5xl max-h-[90vh] rounded-[3rem] overflow-hidden flex flex-col shadow-2xl border border-white/20">
        <div className="p-8 border-b border-white/10 flex justify-between items-center bg-white/5">
          <h3 className="text-2xl font-bold text-white">{title}</h3>
          <button onClick={onClose} className="vision-btn p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="p-10 overflow-y-auto custom-scrollbar bg-black/20">
          {children}
        </div>
      </div>
    </div>
  );
}