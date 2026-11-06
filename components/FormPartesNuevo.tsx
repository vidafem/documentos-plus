"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";
import HorizontalPicker from "./HorizontalPicker";
import { consultarFiscaliaConFallback } from "@/lib/fiscaliaClient";
import ModalBusquedaCedulaFiscalia, { FiscaliaRecordItem } from "./ModalBusquedaCedulaFiscalia";
import {
  toTitleCaseWords,
  toSentenceCase,
  formatDetenidosList,
  formatDescripcionParteCompleta,
  ModalidadParte,
  OPCIONES_MODALIDAD,
  parseCodigoParteCompleto,
  generarDescripcionParte,
} from "@/lib/textFormatters";
import { registrarLogBusqueda } from "@/lib/searchLogger";
import {
  formatExpediente,
  getSequenceFromExpediente,
  obtenerSiguienteExpedientePorAnio,
  acomodarSecuenciaPorFechaCierre,
} from "@/lib/partesSequence";

const normalizeYearInput = (value: string) => value.replace(/\D/g, "").slice(0, 4);
const normalizeUpper = (value: string) => value.toUpperCase();

export default function FormPartesNuevo() {
  const COL_DELITO_CANDIDATAS = [
    "DELITO_TIPIFICADO_EN_DELEGACION",
    "delito_tipificado_en_delegacion",
  ];

  // --- ESTADOS DE CONTROL DE UI ---
  const [isLoading, setIsLoading] = useState(false);
  const [isAcomodando, setIsAcomodando] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // --- CRONOLOGÍA: FECHAS INDEPENDIENTES ---
  // Rige el orden, expediente y código PP: FECHA DE CIERRE
  const [anioApertura, setAnioApertura] = useState("2026");
  const [mesApertura, setMesApertura] = useState("01");
  const [diaApertura, setDiaApertura] = useState("01");

  const [anioCierre, setAnioCierre] = useState("2026");
  const [mesCierre, setMesCierre] = useState("01");
  const [diaCierre, setDiaCierre] = useState("01");
  const [mostrarFechasSeparadas, setMostrarFechasSeparadas] = useState(false);

  // --- ESTADOS VARIABLES ---
  const [nExpediente, setNExpediente] = useState<number>(1);
  const [ppUltimos10, setPpUltimos10] = useState("");
  const [detenidos, setDetenidos] = useState("");
  const [delito, setDelito] = useState("");
  const [fojas, setFojas] = useState("");
  const [ppUnicidad, setPpUnicidad] = useState<"idle" | "unique" | "duplicate">("idle");
  const [sugerencias, setSugerencias] = useState<{ delito: string }[]>([]);
  const [fiscaliaStatus, setFiscaliaStatus] = useState<"idle" | "loading" | "found" | "not_found">("idle");
  const [fiscaliaResult, setFiscaliaResult] = useState<{ delito: string; detenidos: string; count: number } | null>(null);
  const [isCedulaModalOpen, setIsCedulaModalOpen] = useState(false);

  // --- ESTADOS DE MODALIDAD Y CAMPOS DINÁMICOS ---
  const [modalidad, setModalidad] = useState<ModalidadParte>("default");
  const [placa, setPlaca] = useState("");
  const [sinPlaca, setSinPlaca] = useState(false);
  const [direccion, setDireccion] = useState("");
  const [nombreLocal, setNombreLocal] = useState("");
  const [comprobanteCaie, setComprobanteCaie] = useState("");
  const [textoPersonalizado, setTextoPersonalizado] = useState("");

  const handlePasteParteCompleto = (pastedText: string) => {
    const parsed = parseCodigoParteCompleto(pastedText);
    if (parsed) {
      setAnioCierre(parsed.anio);
      setMesCierre(parsed.mes);
      setDiaCierre(parsed.dia);
      setAnioApertura(parsed.anio);
      setMesApertura(parsed.mes);
      setDiaApertura(parsed.dia);
      setPpUltimos10(parsed.secuencia);
      setNotification({
        message: `Código detectado: Cierre ${parsed.anio}-${parsed.mes}-${parsed.dia}`,
        type: "success",
      });
      return true;
    }
    return false;
  };

  // Consultar en la base de datos la última fecha registrada para ese año y mes de cierre
  const obtenerUltimosDiasPorMesYAnio = async (targetAnio: string, targetMes: string) => {
    const anioNorm = normalizeYearInput(targetAnio);
    const mesNorm = targetMes.padStart(2, "0");
    if (anioNorm.length !== 4 || !mesNorm) return;

    try {
      const anioNum = Number(anioNorm);
      const mesNum = Number(mesNorm);
      const ultimoDiaMes = new Date(anioNum, mesNum, 0).getDate();
      const startDate = `${anioNorm}-${mesNorm}-01`;
      const endDate = `${anioNorm}-${mesNorm}-${String(ultimoDiaMes).padStart(2, "0")}`;

      const { data, error } = await supabase
        .from("PARTES")
        .select("fecha_apertura, fecha_cierre")
        .gte("fecha_cierre", startDate)
        .lte("fecha_cierre", endDate)
        .order("fecha_cierre", { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const row = data[0];
        let diaCi = "01";
        let diaAp = "01";

        if (row.fecha_cierre) {
          const partsCi = String(row.fecha_cierre).split("-");
          if (partsCi.length === 3) diaCi = partsCi[2];
        }
        if (row.fecha_apertura) {
          const partsAp = String(row.fecha_apertura).split("-");
          if (partsAp.length === 3) diaAp = partsAp[2];
        } else {
          diaAp = diaCi;
        }

        setDiaCierre(diaCi);
        setDiaApertura(diaAp);
      } else {
        setDiaCierre("01");
        setDiaApertura("01");
      }
    } catch (err) {
      console.error("Error consultando últimos días del mes en PARTES:", err);
    }
  };

  // Inicializar año automáticamente desde el último registro de PARTES
  useEffect(() => {
    let active = true;

    const initDate = async () => {
      try {
        const { data } = await supabase
          .from("PARTES")
          .select("expediente, fecha_apertura, fecha_cierre, created_at")
          .order("created_at", { ascending: false })
          .limit(1);

        if (!active) return;

        let initialYearCierre = "2026";
        let initialMonthCierre = "01";
        let initialDayCierre = "01";
        let initialYearApertura = "2026";
        let initialMonthApertura = "01";
        let initialDayApertura = "01";

        if (data && data.length > 0) {
          const row = data[0];
          if (row.fecha_cierre) {
            const parts = String(row.fecha_cierre).split("-");
            if (parts.length === 3) {
              initialYearCierre = parts[0];
              initialMonthCierre = parts[1];
              initialDayCierre = parts[2];
            }
          } else if (row.expediente) {
            const match = String(row.expediente).match(/-(\d{4})$/);
            if (match) initialYearCierre = match[1];
          }

          if (row.fecha_apertura) {
            const parts = String(row.fecha_apertura).split("-");
            if (parts.length === 3) {
              initialYearApertura = parts[0];
              initialMonthApertura = parts[1];
              initialDayApertura = parts[2];
            }
          } else {
            initialYearApertura = initialYearCierre;
            initialMonthApertura = initialMonthCierre;
            initialDayApertura = initialDayCierre;
          }
        }

        setAnioCierre(initialYearCierre);
        setMesCierre(initialMonthCierre);
        setDiaCierre(initialDayCierre);

        setAnioApertura(initialYearApertura);
        setMesApertura(initialMonthApertura);
        setDiaApertura(initialDayApertura);
      } catch (err) {
        console.error("Error inicializando fecha en Partes:", err);
      }
    };

    void initDate();

    return () => {
      active = false;
    };
  }, []);

  const handleYearCierreChange = async (newYear: string) => {
    const cleanYear = normalizeYearInput(newYear);
    const oldYear = anioCierre;
    setAnioCierre(cleanYear);
    if (anioApertura === oldYear || !anioApertura) {
      setAnioApertura(cleanYear);
    }
    if (cleanYear.length === 4) {
      await obtenerUltimosDiasPorMesYAnio(cleanYear, mesCierre);
      const nextSeq = await obtenerSiguienteExpedientePorAnio("PARTES", cleanYear);
      setNExpediente(nextSeq);
    }
  };

  const handleMesCierreChange = async (newMonth: string) => {
    const oldMonth = mesCierre;
    setMesCierre(newMonth);
    if (mesApertura === oldMonth || !mesApertura) {
      setMesApertura(newMonth);
    }
    await obtenerUltimosDiasPorMesYAnio(anioCierre, newMonth);
  };

  const handleDiaCierreChange = (newDia: string) => {
    setDiaCierre(newDia);
  };

  const handleYearAperturaChange = (newYear: string) => {
    setAnioApertura(normalizeYearInput(newYear));
  };

  const handleMesAperturaChange = (newMonth: string) => {
    setMesApertura(newMonth);
  };

  const handleDiaAperturaChange = (newDia: string) => {
    setDiaApertura(newDia);
  };

  useEffect(() => {
    let active = true;

    const cargar = async () => {
      const anioNormalizado = normalizeYearInput(anioCierre);
      if (!anioNormalizado || !active) return;
      const nextSeq = await obtenerSiguienteExpedientePorAnio("PARTES", anioNormalizado);
      if (active) {
        setNExpediente(nextSeq);
      }
    };

    void cargar();

    return () => {
      active = false;
    };
  }, [anioCierre]);

  const handleAcomodarSecuencia = async () => {
    const safeYear = normalizeYearInput(anioCierre);
    if (safeYear.length !== 4) {
      setNotification({ message: "Ingresa un año de cierre válido de 4 dígitos.", type: "error" });
      return;
    }

    const confirmado = window.confirm(
      `¿Deseas acomodar y renumerar correlativamente todos los expedientes del año ${safeYear} según el orden estricto de su Fecha de Cierre?`
    );
    if (!confirmado) return;

    setIsAcomodando(true);
    try {
      const res = await acomodarSecuenciaPorFechaCierre("PARTES", safeYear);
      if (res.success) {
        setNotification({
          message: `Secuencia del año ${safeYear} acomodada: ${res.updatedCount} expedientes reordenados. Próximo disponible: ${formatExpediente(res.nextSequence, safeYear)}`,
          type: "success",
        });
        setNExpediente(res.nextSequence);
      } else {
        setNotification({ message: res.error || "Error al acomodar secuencia", type: "error" });
      }
    } catch (err) {
      console.error(err);
      setNotification({ message: "Error al ejecutar el acomodo de la secuencia", type: "error" });
    } finally {
      setIsAcomodando(false);
    }
  };

  const usarFechaAperturaParaPP = mostrarFechasSeparadas || modalidad !== "default";
  const anioPPActual = usarFechaAperturaParaPP ? (anioApertura || "----") : (anioCierre || "----");
  const mesPPActual = usarFechaAperturaParaPP ? mesApertura : mesCierre;
  const diaPPActual = usarFechaAperturaParaPP ? diaApertura : diaCierre;

  useEffect(() => {
    if (!ppUltimos10 || ppUltimos10.length < 4) {
      const timer = setTimeout(() => setPpUnicidad("idle"), 0);
      return () => clearTimeout(timer);
    }

    const delayDebounce = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("PARTES")
          .select("id")
          .like("descripcion", `%${ppUltimos10}%`)
          .limit(1);

        if (!error) {
          if (data && data.length > 0) {
            setPpUnicidad("duplicate");
          } else {
            setPpUnicidad("unique");
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 500);

    return () => clearTimeout(delayDebounce);
  }, [anioCierre, mesCierre, diaCierre, anioApertura, mesApertura, diaApertura, mostrarFechasSeparadas, modalidad, ppUltimos10]);

  useEffect(() => {
    const targetAnio = usarFechaAperturaParaPP ? anioApertura : anioCierre;
    const targetMes = usarFechaAperturaParaPP ? mesApertura : mesCierre;
    const targetDia = usarFechaAperturaParaPP ? diaApertura : diaCierre;
    const anioNorm = normalizeYearInput(targetAnio);
    const cleanedDigits = ppUltimos10.replace(/\D/g, "");
    // Consultar automáticamente a partir del 10mo dígito (acepta de 10 a 12 dígitos, sin contar el prefijo PP-YYYYMMDD)
    if (anioNorm.length !== 4 || cleanedDigits.length < 10) {
      setFiscaliaStatus("idle");
      setFiscaliaResult(null);
      return;
    }

    const fullOficio = `${anioNorm}${targetMes}${targetDia.padStart(2, "0")}${cleanedDigits}`;

    const timer = setTimeout(async () => {
      setFiscaliaStatus("loading");
      try {
        const json = await consultarFiscaliaConFallback(`oficio=${encodeURIComponent(fullOficio)}`);
        if (json && json.success && json.found && (json.detenidos || json.delito)) {
          setFiscaliaStatus("found");
          setFiscaliaResult({
            delito: json.delito || "",
            detenidos: json.detenidos || "",
            count: json.procesadosCount || 0,
          });
          void registrarLogBusqueda({
            modulo: "Partes Nuevos",
            numero: fullOficio,
            criterio: "Oficio / Código PP",
            detenidos: json.detenidos || "",
            delito: json.delito || "",
            estado: "exitosa",
            total_encontrados: json.procesadosCount || 1,
          });
        } else {
          setFiscaliaStatus("not_found");
          setFiscaliaResult(null);
          void registrarLogBusqueda({
            modulo: "Partes Nuevos",
            numero: fullOficio,
            criterio: "Oficio / Código PP",
            estado: "normal",
            total_encontrados: 0,
          });
        }
      } catch (err) {
        console.error("Error consultando Fiscalía:", err);
        setFiscaliaStatus("not_found");
        setFiscaliaResult(null);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [anioCierre, mesCierre, diaCierre, anioApertura, mesApertura, diaApertura, mostrarFechasSeparadas, modalidad, ppUltimos10]);

  const handleAutofillFiscalia = () => {
    if (!fiscaliaResult) return;
    if (fiscaliaResult.detenidos) {
      setDetenidos(formatDetenidosList(fiscaliaResult.detenidos));
    }
    if (fiscaliaResult.delito) {
      void buscarDelitos(fiscaliaResult.delito);
    }
  };

  const handleSelectRecordFromCedula = (record: FiscaliaRecordItem, applyDate = true) => {
    if (record.detenidos) {
      setDetenidos(formatDetenidosList(record.detenidos));
    }
    if (record.delito) {
      void buscarDelitos(record.delito);
    }
    if (applyDate && record.fecha) {
      let y = "", m = "", d = "";
      if (record.fecha.includes("-")) {
        const parts = record.fecha.split("-");
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            [y, m, d] = parts;
          } else {
            [d, m, y] = parts;
          }
        }
      } else if (record.fecha.includes("/")) {
        const parts = record.fecha.split("/");
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            [y, m, d] = parts;
          } else {
            [d, m, y] = parts;
          }
        }
      }
      if (y && m && d) {
        setAnioCierre(y);
        setMesCierre(m.padStart(2, "0"));
        setDiaCierre(d.padStart(2, "0"));
        setAnioApertura(y);
        setMesApertura(m.padStart(2, "0"));
        setDiaApertura(d.padStart(2, "0"));
      }
    }
    setFiscaliaStatus("found");
    setFiscaliaResult({
      delito: record.delito || "",
      detenidos: record.detenidos || "",
      count: record.procesadosCount || 1,
    });
    setNotification({
      message: `Causa cargada desde Fiscalía (${record.fecha ? "Fecha: " + record.fecha : "NDD: " + record.ndd})`,
      type: "success",
    });
  };

  // 2. BUSCADOR DE DELITOS
  const buscarDelitos = async (texto: string) => {
    const textoOracion = toSentenceCase(texto);
    setDelito(textoOracion);
    if (texto.trim().length < 3) {
      setSugerencias([]);
      return;
    }
    for (const col of COL_DELITO_CANDIDATAS) {
      const { data, error } = await supabase
        .from("delitos")
        .select(col)
        .ilike(col, `%${texto.trim()}%`)
        .limit(100);

      if (error) {
        continue;
      }

      const filas = (data || []) as unknown[];
      const normalizadas = filas
        .map((row) => {
          const registro = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
          return toSentenceCase(String(registro[col] || ""));
        })
        .filter((d) => d.trim().length > 0);

      // Remove duplicates
      const uniqueDelitos = Array.from(new Set(normalizadas));

      // Sort by length (fewer characters first)
      uniqueDelitos.sort((a, b) => a.length - b.length);

      // Slice top 15 matches
      const suggestionsList = uniqueDelitos.slice(0, 15).map((d) => ({ delito: d }));

      setSugerencias(suggestionsList);
      return;
    }

    console.error("Error en búsqueda de delitos: no se pudo consultar DELITO_TIPIFICADO_EN_DELEGACION");
    setSugerencias([]);
  };

  const handleDetenidosChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    
    // Convierte en tiempo real: primera letra de cada palabra en mayúscula, resto minúscula
    const formatted = toTitleCaseWords(textarea.value);
    setDetenidos(formatted);

    // Mantener la posición del cursor para no interrumpir la escritura continua
    requestAnimationFrame(() => {
      textarea.setSelectionRange(start, end);
    });
  };

  const handleDetenidosKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey) return;

    const textarea = e.currentTarget;
    const start = textarea.selectionStart ?? detenidos.length;
    const end = textarea.selectionEnd ?? detenidos.length;
    const beforeCaret = detenidos.slice(0, start);
    const currentChunk = beforeCaret.split(",").pop() || "";
    const words = currentChunk.trim().split(/\s+/).filter(Boolean);

    if (words.length < 4) return;
    if (beforeCaret.endsWith(" ") || beforeCaret.endsWith(",")) return;

    e.preventDefault();
    const updated = `${detenidos.slice(0, start)}, ${detenidos.slice(end)}`;
    setDetenidos(toTitleCaseWords(updated));
    requestAnimationFrame(() => {
      textarea.setSelectionRange(start + 2, start + 2);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const anioRegistro = normalizeYearInput(anioCierre);
    if (anioRegistro.length !== 4) {
      setIsLoading(false);
      setNotification({ message: "El año de cierre debe tener 4 dígitos.", type: "error" });
      return;
    }

    const anioAp = normalizeYearInput(anioApertura) || anioRegistro;

    // Respetar el número de expediente manual si fue configurado por el usuario, o calcular correlativo
    let numeroExpedienteFinal = Number(nExpediente);
    if (!numeroExpedienteFinal || numeroExpedienteFinal <= 0) {
      const { data: latestData } = await supabase
        .from("PARTES")
        .select("expediente")
        .like("expediente", `%-${anioRegistro}`)
        .order("created_at", { ascending: false })
        .limit(5000);

      const maxSequence = (latestData || []).reduce((acc, row) => {
        const value = String(row.expediente || "");
        const seq = getSequenceFromExpediente(value, anioRegistro);
        return seq > acc ? seq : acc;
      }, 0);
      numeroExpedienteFinal = maxSequence + 1;
    }

    const expedienteFormateado = formatExpediente(numeroExpedienteFinal, anioRegistro);
    const anioPPCodigo = usarFechaAperturaParaPP ? anioAp : anioRegistro;
    const mesPPCodigo = usarFechaAperturaParaPP ? mesApertura : mesCierre;
    const diaPPCodigo = usarFechaAperturaParaPP ? diaApertura : diaCierre;
    const codigoPPFull = `PP-${anioPPCodigo}${mesPPCodigo}${diaPPCodigo.padStart(2, "0")}${ppUltimos10}`;
    const descFinal = generarDescripcionParte(codigoPPFull, modalidad, {
      detenidos,
      delito,
      placa,
      sinPlaca,
      direccion,
      nombreLocal,
      comprobanteCaie,
      textoPersonalizado,
    });

    const registro = {
      expediente: expedienteFormateado,
      n_tomo: "1",
      descripcion: descFinal,
      fecha_apertura: `${anioAp}-${mesApertura}-${diaApertura.padStart(2, "0")}`,
      fecha_cierre: `${anioRegistro}-${mesCierre}-${diaCierre.padStart(2, "0")}`,
      n_fojas: fojas.substring(0, 3),
      destino_final: "ELIMINACIÓN",
      soporte: "FISICO",
      serie: "PROCEDIMIENTOS INVESTIGATIVOS",
    };

    const { error } = await supabase.from("PARTES").insert([registro]);

    setIsLoading(false);
    if (error) {
      setNotification({ message: "Error al guardar el registro", type: "error" });
    } else {
      setNotification({ message: `Registro Guardado (${expedienteFormateado})`, type: "success" });
      setNExpediente(numeroExpedienteFinal + 1);
      setPpUltimos10("");
      setDetenidos("");
      setDelito("");
      setPlaca("");
      setSinPlaca(false);
      setDireccion("");
      setNombreLocal("");
      setComprobanteCaie("");
      setTextoPersonalizado("");
      setFojas("");
      setFiscaliaStatus("idle");
      setFiscaliaResult(null);
    }
  };

  const dias = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"));

  const codigoPPActual = `PP-${anioPPActual}${mesPPActual}${diaPPActual.padStart(2, "0")}${ppUltimos10 || "0000000000"}`;
  const descripcionPreview = generarDescripcionParte(codigoPPActual, modalidad, {
    detenidos,
    delito,
    placa,
    sinPlaca,
    direccion,
    nombreLocal,
    comprobanteCaie,
    textoPersonalizado,
  });

  return (
    <>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      <div className="bg-white/5 rounded-[1.5rem] p-4 border border-white/5 space-y-3 animate-in fade-in duration-500 max-w-4xl mx-auto shadow-2xl">
        {/* HEADER COMPACTO CON SECUENCIA EDITABLE Y BOTÓN DE ACOMODO */}
        <div className="flex flex-wrap justify-between items-center border-b border-white/5 pb-2 gap-2">
          <h2 className="text-sm font-black text-indigo-400 italic uppercase">Partes Policiales</h2>
          <div className="flex items-center gap-2">
            <div className="bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20 flex items-center gap-1.5">
              <span className="text-[8px] text-indigo-300 font-bold uppercase">Exp. Actual:</span>
              <input
                type="number"
                min={1}
                value={nExpediente}
                onChange={(e) => setNExpediente(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 bg-black/50 border border-indigo-500/40 rounded px-1 text-xs font-mono text-white text-center font-bold focus:border-indigo-400 focus:outline-none"
                title="Modificar número para corrección de secuencias o vacíos"
              />
              <span className="text-[8px] text-indigo-200/80 font-bold font-mono">({anioCierre || "----"})</span>
            </div>
            <button
              type="button"
              onClick={handleAcomodarSecuencia}
              disabled={isAcomodando}
              className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 rounded-lg text-[8px] font-bold uppercase transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              title="Acomodar correlativamente todos los expedientes de este año por Fecha de Cierre"
            >
              {isAcomodando ? "Acomodando..." : "⚡ Acomodar Secuencia"}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* FILA 1: CRONOLOGÍA (UNIFICADA EN DEFAULT, INDEPENDIENTE EN OTRAS MODALIDADES) */}
          {modalidad === "default" && !mostrarFechasSeparadas ? (
            /* VISTA COMPACTA UNIFICADA (DEFAULT) */
            <div className="bg-black/60 p-2.5 rounded-xl border border-white/5 space-y-1">
              <div className="flex items-center justify-between pb-1 border-b border-white/5">
                <span className="text-[9px] font-bold text-white/60 uppercase flex items-center gap-1">
                  📅 Fechas (Apertura y Cierre)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] text-indigo-300 font-mono font-bold">
                    {anioCierre}-{mesCierre} | Ap: {diaApertura} | Ci: {diaCierre}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMostrarFechasSeparadas(true)}
                    className="text-[8px] text-indigo-400 hover:text-indigo-200 underline font-bold cursor-pointer"
                    title="Separar año y mes entre Apertura y Cierre"
                  >
                    ⇄ Separar Fechas
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-12 gap-1.5 pt-0.5 items-end">
                {/* AÑO UNIFICADO (RIGE SECUENCIA POR CIERRE) */}
                <div className="col-span-2 space-y-0.5">
                  <label className="text-[7px] font-bold text-white/40 uppercase block leading-tight">Año</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={anioCierre}
                    onChange={(e) => {
                      const val = normalizeYearInput(e.target.value);
                      handleYearCierreChange(val);
                      handleYearAperturaChange(val);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg h-7 text-xs text-center text-white font-bold outline-none focus:border-indigo-500 font-mono"
                    placeholder="2026"
                  />
                </div>
                {/* MES UNIFICADO */}
                <div className="col-span-4 space-y-0.5">
                  <label className="text-[7px] font-bold text-white/40 uppercase block leading-tight">Mes</label>
                  <HorizontalPicker
                    value={mesCierre}
                    onChange={(m) => {
                      handleMesCierreChange(m);
                      handleMesAperturaChange(m);
                    }}
                    options={["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]}
                    columns={6}
                    align="left"
                  />
                </div>
                {/* DÍA APERTURA */}
                <div className="col-span-3 space-y-0.5">
                  <label className="text-[7px] font-bold text-white/40 uppercase block leading-tight">Día Apert.</label>
                  <HorizontalPicker
                    value={diaApertura}
                    onChange={setDiaApertura}
                    options={dias}
                    columns={7}
                    align="center"
                  />
                </div>
                {/* DÍA CIERRE */}
                <div className="col-span-3 space-y-0.5">
                  <label className="text-[7px] font-bold text-white/40 uppercase block leading-tight">Día Cierre</label>
                  <HorizontalPicker
                    value={diaCierre}
                    onChange={setDiaCierre}
                    options={dias}
                    columns={7}
                    align="right"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* VISTA DUAL CON AÑO Y MES INDEPENDIENTES PARA APERTURA Y CIERRE */
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-1">
                <span className="text-[8px] text-indigo-300 font-bold uppercase tracking-wider flex items-center gap-1">
                  <span>⚡</span> Fechas Independientes (Año y Mes por Apertura y Cierre)
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[7px] bg-indigo-500/20 text-indigo-200 px-1.5 py-0.5 rounded font-mono font-bold">
                    Secuencia regida por Cierre ({anioCierre})
                  </span>
                  {modalidad === "default" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMostrarFechasSeparadas(false);
                        setAnioApertura(anioCierre);
                        setMesApertura(mesCierre);
                      }}
                      className="text-[8px] text-indigo-400 hover:text-indigo-200 underline font-bold cursor-pointer"
                    >
                      ⇥ Unificar Fechas
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {/* CARD 1: FECHA DE APERTURA */}
                <div className="bg-black/60 p-2.5 rounded-xl border border-white/5 space-y-1">
                  <div className="flex items-center justify-between pb-1 border-b border-white/5">
                    <span className="text-[9px] font-bold text-white/60 uppercase flex items-center gap-1">
                      📅 Fecha Apertura
                    </span>
                    <span className="text-[8px] text-white/40 font-mono">
                      {anioApertura}-{mesApertura}-{diaApertura}
                    </span>
                  </div>
                  <div className="grid grid-cols-12 gap-1.5 pt-0.5 items-end">
                    <div className="col-span-4 space-y-0.5">
                      <label className="text-[7px] font-bold text-white/40 uppercase block leading-tight">Año Apert.</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={anioApertura}
                        onChange={(e) => handleYearAperturaChange(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-lg h-7 text-xs text-center text-white font-bold outline-none focus:border-indigo-500 font-mono"
                        placeholder="2026"
                      />
                    </div>
                    <div className="col-span-4 space-y-0.5">
                      <label className="text-[7px] font-bold text-white/40 uppercase block leading-tight">Mes Apert.</label>
                      <HorizontalPicker
                        value={mesApertura}
                        onChange={handleMesAperturaChange}
                        options={["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]}
                        columns={6}
                        align="left"
                      />
                    </div>
                    <div className="col-span-4 space-y-0.5">
                      <label className="text-[7px] font-bold text-white/40 uppercase block leading-tight">Día Apert.</label>
                      <HorizontalPicker
                        value={diaApertura}
                        onChange={setDiaApertura}
                        options={dias}
                        columns={7}
                        align="center"
                      />
                    </div>
                  </div>
                </div>

                {/* CARD 2: FECHA DE CIERRE (RIGE EXPEDIENTE Y SECUENCIA) */}
                <div className="bg-indigo-950/20 p-2.5 rounded-xl border border-indigo-500/30 space-y-1 relative">
                  <div className="flex items-center justify-between pb-1 border-b border-indigo-500/20">
                    <span className="text-[9px] font-bold text-indigo-300 uppercase flex items-center gap-1">
                      🏁 Fecha Cierre <span className="text-[7px] bg-indigo-500/20 px-1 py-0.2 rounded text-indigo-200 font-semibold">(Rige Secuencia)</span>
                    </span>
                    <span className="text-[8px] text-indigo-300/80 font-mono font-bold">
                      {anioCierre}-{mesCierre}-{diaCierre}
                    </span>
                  </div>
                  <div className="grid grid-cols-12 gap-1.5 pt-0.5 items-end">
                    <div className="col-span-4 space-y-0.5">
                      <label className="text-[7px] font-bold text-indigo-300 uppercase block leading-tight">Año Cierre</label>
                      <input
                        type="text"
                        maxLength={4}
                        value={anioCierre}
                        onChange={(e) => handleYearCierreChange(e.target.value)}
                        className="w-full bg-white/5 border border-indigo-500/30 rounded-lg h-7 text-xs text-center text-white font-bold outline-none focus:border-indigo-400 font-mono"
                        placeholder="2026"
                      />
                    </div>
                    <div className="col-span-4 space-y-0.5">
                      <label className="text-[7px] font-bold text-indigo-300 uppercase block leading-tight">Mes Cierre</label>
                      <HorizontalPicker
                        value={mesCierre}
                        onChange={handleMesCierreChange}
                        options={["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]}
                        columns={6}
                        align="center"
                      />
                    </div>
                    <div className="col-span-4 space-y-0.5">
                      <label className="text-[7px] font-bold text-indigo-300 uppercase block leading-tight">Día Cierre</label>
                      <HorizontalPicker
                        value={diaCierre}
                        onChange={setDiaCierre}
                        options={dias}
                        columns={7}
                        align="right"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FILA 2: CÓDIGO PP (MÁS COMPACTO) + MODALIDAD / PLANTILLA */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
            {/* CÓDIGO PP (~5 COLS) */}
            <div className="md:col-span-5 space-y-0.5">
              <div className="flex items-center justify-between">
                <label className="text-[8px] font-bold text-white/30 uppercase">Código PP (10-12 dígitos)</label>
                <span className="text-[8px] text-cyan-400/80 font-bold">Autodetecta al pegar</span>
              </div>
              <div className={`flex items-center bg-white/5 border rounded-xl overflow-hidden h-9 ${
                ppUnicidad === "unique" ? "border-emerald-500 focus-within:border-emerald-500" :
                ppUnicidad === "duplicate" ? "border-blue-500 focus-within:border-blue-500" :
                "border-white/10 focus-within:border-indigo-500"
              }`}>
                <span className="bg-white/10 px-2.5 h-full flex items-center text-[10px] font-mono text-white/40 select-none whitespace-nowrap">
                  PP-{anioPPActual}{mesPPActual}{diaPPActual.padStart(2, "0")}
                </span>
                <input
                  required
                  type="text"
                  maxLength={12}
                  value={ppUltimos10}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, "");
                    setPpUltimos10(val);
                  }}
                  onPaste={(e) => {
                    const pasteText = e.clipboardData.getData("text");
                    if (handlePasteParteCompleto(pasteText)) {
                      e.preventDefault();
                    }
                  }}
                  className="flex-1 bg-transparent px-2.5 text-xs text-white outline-none font-bold font-mono tracking-wider min-w-0"
                  placeholder="0000000000"
                />
              </div>
              {ppUnicidad === "unique" && <p className="text-[8px] text-emerald-400 font-bold uppercase mt-0.5 px-1">Código PP Disponible</p>}
              {ppUnicidad === "duplicate" && <p className="text-[8px] text-blue-400 font-bold uppercase mt-0.5 px-1">Código PP Duplicado (Revisar)</p>}
            </div>

            {/* SELECTOR DE MODALIDAD (~7 COLS) */}
            <div className="md:col-span-7 space-y-0.5">
              <label className="text-[8px] font-bold text-indigo-300 uppercase flex items-center gap-1.5">
                <span>⚙️</span> Tipo de Registro / Plantilla
              </label>
              <div className="relative">
                <select
                  value={modalidad}
                  onChange={(e) => setModalidad(e.target.value as ModalidadParte)}
                  className="w-full bg-white/5 border border-indigo-500/30 hover:border-indigo-500/60 focus:border-indigo-500 rounded-xl px-3 pr-8 h-9 text-xs text-white font-bold outline-none cursor-pointer appearance-none transition-all shadow-[0_0_15px_rgba(99,102,241,0.1)] truncate"
                >
                  {OPCIONES_MODALIDAD.map((op) => (
                    <option key={op.id} value={op.id} className="bg-neutral-900 text-white font-normal py-1">
                      {op.icon} {op.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/40 text-[10px]">
                  ▼
                </div>
              </div>
            </div>
          </div>

          {/* FILA 3: CAMPOS DINÁMICOS SEGÚN MODALIDAD */}
          {modalidad === "default" ? (
            <>
              {/* DETENIDOS */}
              <div className="space-y-1">
                <div className="flex items-center justify-between min-h-[22px]">
                  <label className="text-[8px] font-bold text-white/30 uppercase">Detenidos</label>
                  
                  {fiscaliaStatus === "loading" && (
                    <span className="flex items-center gap-1.5 text-[9px] text-cyan-300 font-bold uppercase tracking-wider animate-pulse">
                      <svg className="w-3 h-3 animate-spin text-cyan-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                      </svg>
                      Consultando Fiscalía...
                    </span>
                  )}

                  {fiscaliaStatus === "found" && fiscaliaResult && (
                    <button
                      type="button"
                      onClick={handleAutofillFiscalia}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-300 border border-emerald-500/40 text-[9px] font-black uppercase tracking-wide transition-all shadow-[0_0_15px_rgba(16,185,129,0.35)] hover:scale-105 active:scale-95 cursor-pointer"
                      title="Clic para autorrellenar detenidos y consultar delito en la base de datos"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span>
                        Fiscalía: {fiscaliaResult.count > 0 ? `${fiscaliaResult.count} Procesado(s)` : "Encontrado"} — Clic para rellenar
                      </span>
                    </button>
                  )}

                  {fiscaliaStatus === "not_found" && (
                    <button
                      type="button"
                      onClick={() => setIsCedulaModalOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/35 text-red-300 border border-red-500/30 text-[9px] font-bold uppercase tracking-wide transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                      title="No se encontró por código. Clic para buscar por Cédula o RUC en Fiscalía"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                      <span>Fiscalía: Sin registros — ¿Buscar por Cédula? 🔍</span>
                    </button>
                  )}
                </div>
                <textarea
                  required
                  value={detenidos}
                  onChange={handleDetenidosChange}
                  onBlur={() => setDetenidos((prev) => formatDetenidosList(prev))}
                  onKeyDown={handleDetenidosKeyDown}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white outline-none focus:border-indigo-500 h-14 resize-none custom-scrollbar"
                  placeholder="Nombres de los detenidos (ej: Sarango Lopez Rosa Elena, Coronel Montaño...)"
                />
              </div>

              {/* DELITO + FOJAS */}
              <div className="flex gap-3 relative">
                <div className="flex-[3] space-y-0.5 relative">
                  <label className="text-[8px] font-bold text-white/30 uppercase">Delito</label>
                  <input required type="text" value={delito} onChange={(e) => buscarDelitos(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500" placeholder="Buscar delito..." />
                  {sugerencias.length > 0 && (
                    <ul className="absolute z-50 w-full bg-neutral-950 border border-white/10 rounded-xl mt-1 shadow-2xl max-h-32 overflow-y-auto custom-scrollbar">
                      {sugerencias.map((s, i) => (
                        <li key={i} onClick={() => { setDelito(toSentenceCase(s.delito)); setSugerencias([]); }} className="p-2 text-[10px] text-white hover:bg-indigo-600 cursor-pointer border-b border-white/5 last:border-none transition-colors">
                          {s.delito}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex-1 space-y-0.5">
                  <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
                  <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500" placeholder="0" />
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              {/* Controles dinámicos específicos */}
              {(modalidad === "ingreso_automotor" || modalidad === "ingreso_motocicleta") && (
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[8px] font-bold text-white/40 uppercase">
                        Placa del {modalidad === "ingreso_automotor" ? "Automotor" : "Motocicleta"} (Mayúsculas)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[9px] text-white/50 hover:text-white">
                        <input
                          type="checkbox"
                          checked={sinPlaca}
                          onChange={(e) => setSinPlaca(e.target.checked)}
                          className="rounded accent-indigo-500 cursor-pointer"
                        />
                        <span>Sin Placas</span>
                      </label>
                    </div>
                    <input
                      type="text"
                      disabled={sinPlaca}
                      required={!sinPlaca}
                      value={sinPlaca ? "SIN PLACAS" : placa}
                      onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                      placeholder={sinPlaca ? "Vehículo sin identificación de placas" : "Ej: OBB1715 o GSH3880"}
                      className="w-full bg-white/5 disabled:bg-white/5 border border-white/10 disabled:opacity-50 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white uppercase outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-24 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
                    <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                </div>
              )}

              {(modalidad === "robo_vehiculo" || modalidad === "robo_motocicleta") && (
                <div className="flex gap-3">
                  <div className="w-1/3 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/40 uppercase">Placa (Mayúsculas)</label>
                    <input
                      required
                      type="text"
                      value={placa}
                      onChange={(e) => setPlaca(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                      placeholder="Ej: PBM6863"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white uppercase outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/40 uppercase">Dirección / Lugar del hecho</label>
                    <input
                      required
                      type="text"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Ej: CDLA. Urdesa Central Víctor Emilio Estrada y Bursátiles"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-24 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
                    <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                </div>
              )}

              {(modalidad === "robo_domicilio" || modalidad === "robo_personas" || modalidad === "operativo_policial") && (
                <div className="flex gap-3">
                  <div className="flex-1 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/40 uppercase">
                      {modalidad === "operativo_policial" ? "Dirección / Sector del Operativo" : "Dirección / Lugar del hecho"}
                    </label>
                    <input
                      required
                      type="text"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder={
                        modalidad === "operativo_policial"
                          ? "Ej: AV. Casuarina y AV. 63 N Nueva Prosperina"
                          : "Ej: CDLA. Acuarela del Río MZ. 9 Villa 19"
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-24 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
                    <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                </div>
              )}

              {modalidad === "robo_comercial" && (
                <div className="flex gap-3">
                  <div className="w-1/3 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/40 uppercase">Nombre Comercial / Local (Opcional)</label>
                    <input
                      type="text"
                      value={nombreLocal}
                      onChange={(e) => setNombreLocal(e.target.value)}
                      placeholder='Ej: TUTI o "Farmacia Cruz Azul"'
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/40 uppercase">Dirección / Ubicación</label>
                    <input
                      required
                      type="text"
                      value={direccion}
                      onChange={(e) => setDireccion(e.target.value)}
                      placeholder="Ej: AV. Plaza Dañin y Miguel H. Alcívar"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="w-24 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
                    <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                </div>
              )}

              {modalidad === "ingreso_caie" && (
                <div className="flex gap-3">
                  <div className="flex-1 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/40 uppercase">Comprobante de Ingreso / N°</label>
                    <input
                      required
                      type="text"
                      value={comprobanteCaie}
                      onChange={(e) => setComprobanteCaie(e.target.value)}
                      placeholder="Ej: 0034"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-mono font-bold"
                    />
                  </div>
                  <div className="w-24 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
                    <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                </div>
              )}

              {modalidad === "personalizado" && (
                <div className="flex gap-3">
                  <div className="flex-1 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/40 uppercase">Descripción Libre de la Novedad</label>
                    <textarea
                      required
                      value={textoPersonalizado}
                      onChange={(e) => setTextoPersonalizado(e.target.value)}
                      placeholder="Escriba aquí la novedad o detalle policial..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 h-16 resize-none custom-scrollbar"
                    />
                  </div>
                  <div className="w-24 space-y-0.5">
                    <label className="text-[8px] font-bold text-white/30 uppercase">N° Fojas</label>
                    <input required type="text" maxLength={3} value={fojas} onChange={(e) => setFojas(e.target.value)} className="w-full bg-white/10 border border-white/10 rounded-xl py-2 text-center text-xs text-white font-bold outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VISTA PREVIA EN VIVO */}
          <div className="bg-black/40 border border-cyan-500/20 rounded-xl p-2.5 space-y-1 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase text-cyan-400 tracking-wider flex items-center gap-1.5">
                <span>👁️</span> Vista Previa de la Descripción
              </span>
              <span className="text-[8px] font-mono text-white/30">
                {descripcionPreview.length} caracteres
              </span>
            </div>
            <p className="text-[11px] font-mono text-cyan-200/90 break-words bg-black/60 p-2 rounded-lg border border-white/5 leading-relaxed selection:bg-cyan-500 selection:text-black">
              {descripcionPreview || <span className="text-white/20 italic">Complete los campos para ver la descripción aquí...</span>}
            </p>
          </div>

          {/* BOTÓN FINAL CON ESTADOS DINÁMICOS */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={isLoading}
              className={`px-12 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-2xl transition-all active:scale-95 tracking-tighter flex items-center gap-2
                ${isLoading ? "bg-white/20 text-white/50 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"}
              `}
            >
              {isLoading ? "Procesando..." : "Guardar Registro"}
            </button>
          </div>
        </form>
      </div>

      <ModalBusquedaCedulaFiscalia
        isOpen={isCedulaModalOpen}
        onClose={() => setIsCedulaModalOpen(false)}
        onSelectRecord={handleSelectRecordFromCedula}
      />
    </>
  );
}
