"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

export default function FormDelegaciones() {
  // --- ESTADO DE UI ---
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // --- VALORES PERSISTENTES (Sticky) ---
  const [anioBase, setAnioBase] = useState("2021");
  const [mesBase, setMesBase] = useState("12");
  const [mesApertura, setMesApertura] = useState("12");
  const [mesCierre, setMesCierre] = useState("12");
  const [oficioAnio, setOficioAnio] = useState("2021");
  const [destino, setDestino] = useState("Eliminación");

  // --- VALORES VARIABLES (Se limpian al guardar) ---
  const [expedienteSufijo, setExpedienteSufijo] = useState("");
  const [diaApertura, setDiaApertura] = useState("");
  const [diaCierre, setDiaCierre] = useState("");
  const [fojas, setFojas] = useState("");
  const [oficioN, setOficioN] = useState("");
  const [oficio4D, setOficio4D] = useState("");
  const [oficio6D, setOficio6D] = useState("");
  const [delito, setDelito] = useState("");
  const [sugerencias, setSugerencias] = useState<{ delito: string }[]>([]);
  const [sospechosos, setSospechosos] = useState("");

  useEffect(() => {
    setMesApertura(mesBase);
    setMesCierre(mesBase);
  }, [mesBase]);

  useEffect(() => {
    setOficioAnio(anioBase);
  }, [anioBase]);

  const COL_DELITO_CANDIDATAS = [
    "DELITO_TIPIFICADO_EN_DELEGACION",
    "delito_tipificado_en_delegacion",
  ];

  const buscarDelitos = async (texto: string) => {
    setDelito(texto);
    if (texto.length < 3) {
      setSugerencias([]);
      return;
    }

    for (const col of COL_DELITO_CANDIDATAS) {
      const { data, error } = await supabase
        .from("delitos")
        .select(col)
        .ilike(col, `%${texto}%`)
        .limit(8);

      if (error) {
        continue;
      }

      const filas = (data || []) as unknown[];
      const normalizadas = filas
        .map((row) => {
          const registro = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          return { delito: String(registro[col] || "") };
        })
        .filter((row) => row.delito.trim().length > 0);

      setSugerencias(normalizadas);
      return;
    }

    console.error("Error en búsqueda: no se pudo consultar DELITO_TIPIFICADO_EN_DELEGACION");
    setSugerencias([]);
  };

  const formatTitleCase = (str: string) => {
    return str.toLowerCase().replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
   
    const descFinal = `Oficio No.FPG-FEIFO${oficioN}-${oficio4D}-${oficioAnio}-${oficio6D}-O; Delito: ${formatTitleCase(delito)}; Sospechosos: ${formatTitleCase(sospechosos)}.`;

    const registroFinal = {
      n_caja: "",
      expediente: `IF-0901018${expedienteSufijo}`,
      n_tomo: "",
      descripcion: descFinal,
      fecha_apertura: `${anioBase}-${mesApertura}-${diaApertura.padStart(2, '0')}`,
      fecha_cierre: `${anioBase}-${mesCierre}-${diaCierre.padStart(2, '0')}`,
      n_fojas: fojas,
      destino_final: destino,
      serie: "PROCEDIMIENTOS INVESTIGATIVOS",
      soporte: "Fisico"
    };

    const { error } = await supabase.from('delegaciones_viejas').insert([registroFinal]);

    setIsLoading(false);
    if (error) {
      setNotification({ message: "Error al guardar: " + error.message, type: 'error' });
    } else {
      setNotification({ message: "Guardado con éxito", type: 'success' });
      
      // Limpieza de campos variables
      setExpedienteSufijo(""); setOficioN(""); setOficio4D(""); setOficio6D("");
      setDelito(""); setSospechosos(""); setDiaApertura(""); setDiaCierre(""); setFojas("");
    }
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
      <form onSubmit={handleSubmit} className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-6 animate-in fade-in duration-500">
        
        {/* 1. CONTROLES CONSTANTES */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-3">
          <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Parámetros constantes</label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase">Año base</label>
              <input type="text" maxLength={4} value={anioBase} onChange={(e) => setAnioBase(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-full bg-white/10 border border-indigo-500/30 rounded-xl p-2 text-xs text-center text-white outline-none focus:border-indigo-500" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase">Mes base</label>
              <select value={mesBase} onChange={(e) => setMesBase(e.target.value)} className="w-full bg-neutral-900 border border-white/10 rounded-xl p-2 text-xs text-white outline-none">
                <option value="01">01 - Ene</option><option value="02">02 - Feb</option><option value="03">03 - Mar</option><option value="04">04 - Abr</option><option value="05">05 - May</option><option value="06">06 - Jun</option><option value="07">07 - Jul</option><option value="08">08 - Ago</option><option value="09">09 - Sep</option><option value="10">10 - Oct</option><option value="11">11 - Nov</option><option value="12">12 - Dic</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase">Año oficio (editable)</label>
              <input type="text" maxLength={4} value={oficioAnio} onChange={(e) => setOficioAnio(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-full bg-white/10 border border-white/10 rounded-xl p-2 text-xs text-center text-white outline-none focus:border-indigo-500" />
            </div>
          </div>
        </div>

        {/* 2. EXPEDIENTE */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <label className="text-[10px] font-bold text-white/30 uppercase">N° de Expediente</label>
            <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500 transition-all">
              <span className="bg-white/10 px-2 py-2 text-[10px] text-white/40 font-mono">IF-0901018</span>
              <input required type="text" value={expedienteSufijo} onChange={(e) => setExpedienteSufijo(e.target.value)} className="flex-1 bg-transparent p-2 text-xs text-white outline-none" />
            </div>
          </div>
        </div>

        {/* 3. DATOS DEL OFICIO Y BUSCADOR DE DELITOS */}
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-white/50 font-mono">Oficio No.FPG-FEIFO</span>
            <input required type="text" maxLength={2} value={oficioN} onChange={(e) => setOficioN(e.target.value)} className="w-10 bg-white/10 border border-white/10 rounded-lg p-1 text-xs text-center outline-none focus:border-indigo-500" placeholder="00" />
            <span className="text-white/30">-</span>
            <input required type="text" maxLength={4} value={oficio4D} onChange={(e) => setOficio4D(e.target.value)} className="w-14 bg-white/10 border border-white/10 rounded-lg p-1 text-xs text-center outline-none focus:border-indigo-500" placeholder="0000" />
            <span className="text-white/30">-</span>
            <input required type="text" maxLength={4} value={oficioAnio} onChange={(e) => setOficioAnio(e.target.value.replace(/\D/g, "").slice(0, 4))} className="w-14 bg-white/10 border border-white/10 rounded-lg p-1 text-xs text-center text-indigo-300 font-bold outline-none focus:border-indigo-500" placeholder="AAAA" />
            <span className="text-white/30">-</span>
            <input required type="text" maxLength={6} value={oficio6D} onChange={(e) => setOficio6D(e.target.value)} className="w-20 bg-white/10 border border-white/10 rounded-lg p-1 text-xs text-center outline-none focus:border-indigo-500" placeholder="000000" />
            <span className="text-[10px] text-white/50 font-mono">-O</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase">Delito</label>
              <input
                required
                type="text"
                value={delito}
                onChange={(e) => buscarDelitos(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500"
                placeholder="Ej: tenencia..."
                autoComplete="off"
              />
              {sugerencias.length > 0 && (
                <ul className="absolute z-50 w-full bg-neutral-900 border border-white/10 rounded-xl mt-1 shadow-2xl max-h-40 overflow-y-auto overflow-x-hidden">
                  {sugerencias.map((s, i) => (
                    <li
                      key={i}
                      onClick={() => {
                        setDelito(s.delito);
                        setSugerencias([]);
                      }}
                      className="p-3 text-[10px] text-white hover:bg-indigo-600 cursor-pointer border-b border-white/5 last:border-none transition-colors"
                    >
                      {s.delito}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-white/30 uppercase">Sospechosos</label>
              <input required type="text" value={sospechosos} onChange={(e) => setSospechosos(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white outline-none focus:border-indigo-500" placeholder="Nombres..." />
            </div>
          </div>
        </div>

        {/* 4. FECHAS, FOJAS Y DESTINO (REESTRUCTURADO) */}
        <div className="flex flex-wrap gap-4 items-end">
          {/* APERTURA */}
          <div className="flex-1 min-w-[220px] bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2">
            <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Apertura</label>
            <div className="grid grid-cols-5 gap-2">
              <input required type="text" maxLength={2} value={diaApertura} onChange={(e) => setDiaApertura(e.target.value)} className="col-span-1 bg-white/10 border border-white/10 rounded-lg p-2 text-xs text-center text-white outline-none focus:border-indigo-500" placeholder="DD" />
              <select value={mesApertura} onChange={(e) => setMesApertura(e.target.value)} className="col-span-2 bg-neutral-900 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none">
                <option value="01">Ene</option><option value="02">Feb</option><option value="03">Mar</option><option value="04">Abr</option><option value="05">May</option><option value="06">Jun</option><option value="07">Jul</option><option value="08">Ago</option><option value="09">Sep</option><option value="10">Oct</option><option value="11">Nov</option><option value="12">Dic</option>
              </select>
              <div className="col-span-2 bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-center text-white/80 font-bold">{anioBase || "AAAA"}</div>
            </div>
          </div>

          {/* CIERRE */}
          <div className="flex-1 min-w-[220px] bg-white/5 p-4 rounded-2xl border border-white/5 space-y-2">
            <label className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Cierre</label>
            <div className="grid grid-cols-5 gap-2">
              <input required type="text" maxLength={2} value={diaCierre} onChange={(e) => setDiaCierre(e.target.value)} className="col-span-1 bg-white/10 border border-white/10 rounded-lg p-2 text-xs text-center text-white outline-none focus:border-indigo-500" placeholder="DD" />
              <select value={mesCierre} onChange={(e) => setMesCierre(e.target.value)} className="col-span-2 bg-neutral-900 border border-white/10 rounded-lg p-2 text-[10px] text-white outline-none">
                <option value="01">Ene</option><option value="02">Feb</option><option value="03">Mar</option><option value="04">Abr</option><option value="05">May</option><option value="06">Jun</option><option value="07">Jul</option><option value="08">Ago</option><option value="09">Sep</option><option value="10">Oct</option><option value="11">Nov</option><option value="12">Dic</option>
              </select>
              <div className="col-span-2 bg-white/5 border border-white/10 rounded-lg p-2 text-xs text-center text-white/80 font-bold">{anioBase || "AAAA"}</div>
            </div>
          </div>

          {/* FOJAS */}
          <div className="w-20 space-y-1">
            <label className="text-[10px] font-bold text-white/30 uppercase">Fojas</label>
            <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-center text-white outline-none focus:border-indigo-500" placeholder="000" />
          </div>
        
          {/* DESTINO */}
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-bold text-white/30 uppercase ml-1">Destino Final</label>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none">
              <option value="Eliminación">Eliminación</option>
              <option value="Archivo">Archivo</option>
            </select>
          </div>
        </div>

        {/* 5. BOTÓN GUARDAR */}
        <div className="flex justify-end pt-2">
          <button 
            type="submit" 
            disabled={isLoading}
            className={`px-10 py-3 rounded-2xl font-black text-[11px] uppercase shadow-2xl transition-all active:scale-95 tracking-tighter flex items-center gap-2
              ${isLoading ? "bg-white/20 text-white/50 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500 text-white"}
            `}
          >
            {isLoading ? "Procesando..." : "Guardar Registro"}
          </button>
        </div>
      </form>
    </>
  );
}