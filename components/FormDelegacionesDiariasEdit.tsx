"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

type PeritoSuggestion = {
  grado: string;
  perito: string;
};

type DelitoSuggestion = {
  DELITO: string;
  DELITO_TIPIFICADO_EN_DELEGACION: string;
  TIPO_DE_DELITO: string;
};

type FiscalSuggestion = {
  fiscal: string;
  cod: string;
};

type FormState = {
  mesIngresoDisposicionesFiscales: string;
  anioCabecera: string;
  ifAnio: string;
  ifSecuencial: string;
  codDistrito: string;
  distrito: string;
  grado: string;
  perito: string;
  tipoDelito: string;
  delitoTipificadoEnDelegacion: string;
  delitoDesagregacionPoliciaJudicial: string;
  fechaInfraccionAnio: string;
  fechaInfraccionMes: string;
  fechaInfraccionDia: string;
  detenido: string;
  condicionInfractorInvolucrado: string;
  apellidosNombresFiscal: string;
  unidadEspecializadaFiscalia: string;
  fDelegacionAnio: string;
  fDelegacionMes: string;
  fDelegacionDia: string;
  fRecepcionAnio: string;
  fRecepcionMes: string;
  fRecepcionDia: string;
  fechaRecepcionAgenteInvestigadorAnio: string;
  fechaRecepcionAgenteInvestigadorMes: string;
  fechaRecepcionAgenteInvestigadorDia: string;
  fAudicencia: string;
  numeroOficioRecibeDiligenciaAgente: string;
  plazoDias: string;
};

const initialState: FormState = {
  mesIngresoDisposicionesFiscales: "",
  anioCabecera: String(new Date().getFullYear()),
  ifAnio: String(new Date().getFullYear()),
  ifSecuencial: "",
  codDistrito: "",
  distrito: "",
  grado: "",
  perito: "",
  tipoDelito: "",
  delitoTipificadoEnDelegacion: "",
  delitoDesagregacionPoliciaJudicial: "",
  fechaInfraccionAnio: String(new Date().getFullYear()),
  fechaInfraccionMes: "",
  fechaInfraccionDia: "",
  detenido: "",
  condicionInfractorInvolucrado: "",
  apellidosNombresFiscal: "",
  unidadEspecializadaFiscalia: "",
  fDelegacionAnio: String(new Date().getFullYear()),
  fDelegacionMes: "",
  fDelegacionDia: "",
  fRecepcionAnio: String(new Date().getFullYear()),
  fRecepcionMes: "",
  fRecepcionDia: "",
  fechaRecepcionAgenteInvestigadorAnio: String(new Date().getFullYear()),
  fechaRecepcionAgenteInvestigadorMes: "",
  fechaRecepcionAgenteInvestigadorDia: "",
  fAudicencia: "",
  numeroOficioRecibeDiligenciaAgente: "",
  plazoDias: "",
};

const STORAGE_KEY_MES = "flagrancia_mes_ingreso_constante";
const IF_PREFIX = "901018";
const COD_DISTRITO_PREFIX = "09D";
const ZONA_CONSTANTE = "ZONA 8";
const PROVINCIA_CONSTANTE = "DMG";
const CANTON_CONSTANTE = "GUAYAQUIL";
const MONTH_OPTIONS = [
  "ENERO",
  "FEBRERO",
  "MARZO",
  "ABRIL",
  "MAYO",
  "JUNIO",
  "JULIO",
  "AGOSTO",
  "SEPTIEMBRE",
  "OCTUBRE",
  "NOVIEMBRE",
  "DICIEMBRE",
];
const COD_DISTRITO_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index + 1).padStart(2, "0"));

type FieldConfig = {
  key: keyof FormState;
  label: string;
  type?: "text" | "date" | "number";
  gridClass?: string;
};

const fields: FieldConfig[] = [
  { key: "numeroOficioRecibeDiligenciaAgente", label: "N. oficio agente", gridClass: "md:col-span-1 xl:col-span-1" },
];

type FormDelegacionesDiariasProps = {
  mode?: "create" | "edit";
  editId?: number | string | null;
  initialRecord?: Record<string, unknown> | null;
  onCancelEdit?: () => void;
  onSavedEdit?: () => void;
};

const splitDateParts = (value: unknown): { anio: string; mes: string; dia: string } => {
  const txt = String(value || "").trim();
  if (!txt) return { anio: "", mes: "", dia: "" };
  const normalizado = txt.replace(/\//g, "-");
  const [anio = "", mes = "", dia = ""] = normalizado.split("-");
  return {
    anio: anio.slice(0, 4),
    mes: mes.replace(/\D/g, "").slice(0, 2),
    dia: dia.replace(/\D/g, "").slice(0, 2),
  };
};

const toDateTimeLocalValue = (value: unknown): string => {
  const txt = String(value || "").trim();
  if (!txt) return "";
  const d = new Date(txt);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const normalizeUnidadToNumfis = (value: unknown): string => {
  const txt = String(value || "").toUpperCase().trim();
  if (!txt) return "";
  const soloDigitos = txt.replace(/\D/g, "");
  return soloDigitos;
};

const mapRecordToFormState = (record: Record<string, unknown>): FormState => {
  const ifRaw = String(record["IF"] || "").replace(/\D/g, "");
  const ifAnio2 = ifRaw.length >= 8 ? ifRaw.slice(6, 8) : "";
  const ifAnio = ifAnio2 ? `20${ifAnio2}` : String(new Date().getFullYear());
  const ifSecuencial = ifRaw.length > 8 ? ifRaw.slice(8, 14) : "";

  const inf = splitDateParts(record["FECHA_DE_LA_INFRACIÓN_DELITO"]);
  const fDel = splitDateParts(record["F_DELEGACION"]);
  const fRec = splitDateParts(record["F_RECEPCION"]);
  const fRecAg = splitDateParts(record["FECHA_DE_RECEPCION_POR_PARTE_AGENTE_INVESTIGADOR"]);

  return {
    ...initialState,
    mesIngresoDisposicionesFiscales: String(record["MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES"] || "").toUpperCase(),
    anioCabecera: ifAnio,
    ifAnio,
    ifSecuencial,
    codDistrito: String(record["COD._DISTRITO"] || ""),
    distrito: String(record["DISTRITO"] || ""),
    grado: String(record["GRADO"] || ""),
    perito: String(record["PERITO"] || ""),
    tipoDelito: String(record["TIPO_DE_DELITO"] || ""),
    delitoTipificadoEnDelegacion: String(record["DELITO_TIPIFICADO_EN_DELEGACION"] || ""),
    delitoDesagregacionPoliciaJudicial: String(record["DELITO_DESAGREGACION_POLICIA_JUDICIAL"] || ""),
    fechaInfraccionAnio: inf.anio || ifAnio,
    fechaInfraccionMes: inf.mes,
    fechaInfraccionDia: inf.dia,
    detenido: String(record["DETENIDO"] || ""),
    condicionInfractorInvolucrado: String(record["CONDICIÓN_DEL_INFRACTOR_INVOLUCRADO"] || ""),
    apellidosNombresFiscal: String(record["APELLIDOS_Y_NOMBRES_DEL_FISCAL"] || ""),
    unidadEspecializadaFiscalia: normalizeUnidadToNumfis(record["UNIDAD_ESPECIALIZADA_DE_FISCALIA"]),
    fDelegacionAnio: fDel.anio || ifAnio,
    fDelegacionMes: fDel.mes,
    fDelegacionDia: fDel.dia,
    fRecepcionAnio: fRec.anio || ifAnio,
    fRecepcionMes: fRec.mes,
    fRecepcionDia: fRec.dia,
    fechaRecepcionAgenteInvestigadorAnio: fRecAg.anio || ifAnio,
    fechaRecepcionAgenteInvestigadorMes: fRecAg.mes,
    fechaRecepcionAgenteInvestigadorDia: fRecAg.dia,
    fAudicencia: toDateTimeLocalValue(record["F_AUDICENCIA"]),
    numeroOficioRecibeDiligenciaAgente: String(record["Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE"] || "").replace(/\D/g, "").slice(0, 6),
    plazoDias: String(record["PLAZO_DIAS"] || ""),
  };
};

export default function FormDelegacionesDiarias({
  mode = "create",
  editId = null,
  initialRecord = null,
  onCancelEdit,
  onSavedEdit,
}: FormDelegacionesDiariasProps) {
  const [formData, setFormData] = useState<FormState>(initialState);
  const [isSaving, setIsSaving] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [peritoSugerencias, setPeritoSugerencias] = useState<PeritoSuggestion[]>([]);
  const [delitoSugerencias, setDelitoSugerencias] = useState<DelitoSuggestion[]>([]);
  const [fiscalSugerencias, setFiscalSugerencias] = useState<FiscalSuggestion[]>([]);
  const [fiscaliasDisponibles, setFiscaliasDisponibles] = useState<string[]>([]);
  const [codFiscalSeleccionado, setCodFiscalSeleccionado] = useState("");
  const [mostrarModalNuevaFiscalia, setMostrarModalNuevaFiscalia] = useState(false);
  const [nuevaFiscaliaNumfis, setNuevaFiscaliaNumfis] = useState("");
  const [nuevoFiscalCod, setNuevoFiscalCod] = useState("");
  const [mostrarModalNuevoFiscal, setMostrarModalNuevoFiscal] = useState(false);
  const [nuevoFiscalNombreCompleto, setNuevoFiscalNombreCompleto] = useState("");
  const [nuevoFiscalNumfis, setNuevoFiscalNumfis] = useState("");
  const [nuevoFiscalCodCompleto, setNuevoFiscalCodCompleto] = useState("");

  const codDistritoSufijo = formData.codDistrito.startsWith(COD_DISTRITO_PREFIX)
    ? formData.codDistrito.slice(COD_DISTRITO_PREFIX.length)
    : "";

  useEffect(() => {
    if (mode === "edit") {
      return;
    }

    let isActive = true;

    const cargarMesConstante = async () => {
      const localMes = localStorage.getItem(STORAGE_KEY_MES);
      if (localMes && MONTH_OPTIONS.includes(localMes)) {
        if (isActive) {
          setFormData((prev) => ({ ...prev, mesIngresoDisposicionesFiscales: localMes }));
        }
        return;
      }

      const columnasOrden = ["created_at", "id"] as const;
      for (const colOrden of columnasOrden) {
        const { data, error } = await supabase
          .from("FLAGRANCIA")
          .select("MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES")
          .order(colOrden, { ascending: false })
          .limit(1);

        if (error) {
          continue;
        }

        const fila = (data?.[0] ?? null) as Record<string, unknown> | null;
        const mes = String(fila?.MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES || "").toUpperCase();

        if (MONTH_OPTIONS.includes(mes)) {
          localStorage.setItem(STORAGE_KEY_MES, mes);
          if (isActive) {
            setFormData((prev) => ({ ...prev, mesIngresoDisposicionesFiscales: mes }));
          }
          return;
        }
      }

      const mesActual = MONTH_OPTIONS[new Date().getMonth()];
      localStorage.setItem(STORAGE_KEY_MES, mesActual);
      if (isActive) {
        setFormData((prev) => ({ ...prev, mesIngresoDisposicionesFiscales: mesActual }));
      }
    };

    cargarMesConstante();
    return () => {
      isActive = false;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== "edit" || !initialRecord) {
      return;
    }

    const hydrateFromRecord = async () => {
      const mapped = mapRecordToFormState(initialRecord);
      setFormData(mapped);

      const nombreFiscal = mapped.apellidosNombresFiscal.trim().toUpperCase();
      if (!nombreFiscal) {
        return;
      }

      const { data } = await supabase
        .from("fiscal")
        .select("FISCAL, NUMFIS, COD")
        .eq("FISCAL", nombreFiscal)
        .limit(200);

      const filas = (data || []) as Array<Record<string, unknown>>;
      const codDetectado = String(filas.find((fila) => fila.COD)?.COD ?? "").trim();
      const opcionesUnicas = Array.from(
        new Set(
          filas
            .map((fila) => String(fila.NUMFIS ?? "").trim())
            .filter(Boolean)
        )
      ).sort((a, b) => Number(a) - Number(b));

      setCodFiscalSeleccionado(codDetectado);
      setFiscaliasDisponibles(opcionesUnicas);
    };

    void hydrateFromRecord();
  }, [mode, initialRecord]);

  const handleChange = (key: keyof FormState, value: string) => {
    if (key === "mesIngresoDisposicionesFiscales") {
      const mes = value.toUpperCase();
      localStorage.setItem(STORAGE_KEY_MES, mes);
      setFormData((prev) => ({ ...prev, mesIngresoDisposicionesFiscales: mes }));
      return;
    }

    if (key === "anioCabecera") {
      setFormData((prev) => ({
        ...prev,
        anioCabecera: value,
        ifAnio: value,
        fechaInfraccionAnio: value,
        fDelegacionAnio: value,
        fRecepcionAnio: value,
        fechaRecepcionAgenteInvestigadorAnio: value,
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const buscarPeritos = async (texto: string) => {
    setFormData((prev) => ({ ...prev, perito: texto, grado: "" }));

    if (texto.trim().length < 2) {
      setPeritoSugerencias([]);
      return;
    }

    const { data, error } = await supabase
      .from("perito")
      .select("grado, perito")
      .ilike("perito", `%${texto}%`)
      .limit(8);

    if (error) {
      console.error("Error cargando peritos:", error.message);
      setPeritoSugerencias([]);
      return;
    }

    const sugerencias = ((data || []) as PeritoSuggestion[]).filter((item) => item.perito);
    setPeritoSugerencias(sugerencias);
  };

  const seleccionarPerito = (item: PeritoSuggestion) => {
    setFormData((prev) => ({
      ...prev,
      perito: item.perito,
      grado: item.grado,
    }));
    setPeritoSugerencias([]);
  };

  const buscarDelitos = async (texto: string) => {
    setFormData((prev) => ({
      ...prev,
      delitoDesagregacionPoliciaJudicial: texto,
      delitoTipificadoEnDelegacion: "",
      tipoDelito: "",
    }));

    if (texto.trim().length < 2) {
      setDelitoSugerencias([]);
      return;
    }

    const { data, error } = await supabase
      .from("delitos")
      .select("DELITO, DELITO_TIPIFICADO_EN_DELEGACION, TIPO_DE_DELITO")
      .ilike("DELITO", `%${texto}%`)
      .limit(8);

    if (error) {
      console.error("Error cargando delitos:", error.message);
      setDelitoSugerencias([]);
      return;
    }

    const sugerencias = ((data || []) as DelitoSuggestion[]).filter((item) => item.DELITO);
    setDelitoSugerencias(sugerencias);
  };

  const seleccionarDelito = (item: DelitoSuggestion) => {
    setFormData((prev) => ({
      ...prev,
      delitoDesagregacionPoliciaJudicial: item.DELITO,
      delitoTipificadoEnDelegacion: item.DELITO_TIPIFICADO_EN_DELEGACION || "",
      tipoDelito: item.TIPO_DE_DELITO || "",
    }));
    setDelitoSugerencias([]);
  };

  const handleCodDistritoChange = async (suffix: string) => {
    const codigoCompleto = `${COD_DISTRITO_PREFIX}${suffix}`;
    setFormData((prev) => ({ ...prev, codDistrito: codigoCompleto, distrito: "" }));

    const { data, error } = await supabase
      .from("distrito")
      .select('DISTRITO,"COD._DISTRITO"')
      .eq('"COD._DISTRITO"', codigoCompleto)
      .limit(1);

    if (error) {
      console.error("Error cargando distrito:", error.message);
      return;
    }

    const fila = (data?.[0] ?? null) as Record<string, unknown> | null;
    const nombreDistrito = String(fila?.DISTRITO || "");

    setFormData((prev) => ({
      ...prev,
      codDistrito: codigoCompleto,
      distrito: nombreDistrito,
    }));
  };

  const ifCompleto = `${IF_PREFIX}${formData.ifAnio.slice(-2)}${formData.ifSecuencial}`;
  const fechaInfraccionCompleta = formData.fechaInfraccionMes && formData.fechaInfraccionDia
    ? `${formData.fechaInfraccionAnio}/${formData.fechaInfraccionMes}/${formData.fechaInfraccionDia}`
    : "";
  const fDelegacionCompleta = formData.fDelegacionMes && formData.fDelegacionDia
    ? `${formData.fDelegacionAnio}/${formData.fDelegacionMes}/${formData.fDelegacionDia}`
    : "";
  const fRecepcionCompleta = formData.fRecepcionMes && formData.fRecepcionDia
    ? `${formData.fRecepcionAnio}/${formData.fRecepcionMes}/${formData.fRecepcionDia}`
    : "";
  const fechaRecepcionAgenteCompleta = formData.fechaRecepcionAgenteInvestigadorMes && formData.fechaRecepcionAgenteInvestigadorDia
    ? `${formData.fechaRecepcionAgenteInvestigadorAnio}/${formData.fechaRecepcionAgenteInvestigadorMes}/${formData.fechaRecepcionAgenteInvestigadorDia}`
    : "";

  const formatDetenidoInput = (value: string) => {
    const upperValue = value.toUpperCase().replace(/\s+,/g, ",").replace(/,\s*/g, ", ");

    if (!upperValue.endsWith(" ")) {
      return upperValue;
    }

    const trimmedValue = upperValue.trimEnd();
    const personas = trimmedValue.split(",").map((item) => item.trim());
    const ultimaPersona = personas[personas.length - 1] || "";
    const palabras = ultimaPersona.split(/\s+/).filter(Boolean);

    if (palabras.length === 4) {
      return `${personas.filter(Boolean).join(", ")}, `;
    }

    return upperValue;
  };

  const handleDetenidoChange = (value: string) => {
    setFormData((prev) => ({ ...prev, detenido: formatDetenidoInput(value) }));
  };

  const formatearUnidadParaFlagrancia = (unidad: string) => {
    const limpia = unidad.trim().toUpperCase();
    if (!limpia) {
      return "";
    }
    if (limpia.startsWith("FLAGRANCIA")) {
      return limpia;
    }
    return `FLAGRANCIA ${limpia}`;
  };

  const cargarFiscaliasPorFiscal = async (fiscal: string) => {
    const nombreFiscal = fiscal.trim().toUpperCase();
    if (!nombreFiscal) {
      setFiscaliasDisponibles([]);
      setCodFiscalSeleccionado("");
      setFormData((prev) => ({ ...prev, unidadEspecializadaFiscalia: "" }));
      return;
    }

    const { data, error } = await supabase
      .from("fiscal")
      .select("FISCAL, NUMFIS, COD")
      .eq("FISCAL", nombreFiscal)
      .limit(200);

    if (error) {
      console.error("Error cargando fiscalias:", error.message);
      setFiscaliasDisponibles([]);
      setCodFiscalSeleccionado("");
      return;
    }

    const filas = (data || []) as Array<Record<string, unknown>>;
    const codDetectado = String(filas.find((fila) => fila.COD)?.COD ?? "").trim();

    const opcionesUnicas = Array.from(
      new Set(
        filas
          .map((fila) => String(fila.NUMFIS ?? "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => Number(a) - Number(b));

    setCodFiscalSeleccionado(codDetectado);
    setFiscaliasDisponibles(opcionesUnicas);
    setFormData((prev) => ({
      ...prev,
      unidadEspecializadaFiscalia: opcionesUnicas.includes(prev.unidadEspecializadaFiscalia)
        ? prev.unidadEspecializadaFiscalia
        : (opcionesUnicas[0] || ""),
    }));
  };

  const buscarFiscales = async (texto: string) => {
    const textoMayus = texto.toUpperCase();
    setFormData((prev) => ({ ...prev, apellidosNombresFiscal: textoMayus, unidadEspecializadaFiscalia: "" }));
    setFiscaliasDisponibles([]);

    if (textoMayus.trim().length < 2) {
      setFiscalSugerencias([]);
      return;
    }

    const { data, error } = await supabase
      .from("fiscal")
      .select("FISCAL, COD")
      .ilike("FISCAL", `%${textoMayus}%`)
      .limit(20);

    if (error) {
      console.error("Error cargando fiscales:", error.message);
      setFiscalSugerencias([]);
      return;
    }

    const filas = (data || []) as Array<Record<string, unknown>>;
    const mapa = new Map<string, FiscalSuggestion>();

    filas.forEach((fila) => {
      const fiscal = String(fila.FISCAL ?? "").trim().toUpperCase();
      const cod = String(fila.COD ?? "").trim();
      if (!fiscal || mapa.has(fiscal)) {
        return;
      }
      mapa.set(fiscal, { fiscal, cod });
    });

    setFiscalSugerencias(Array.from(mapa.values()));
  };

  const seleccionarFiscal = async (item: FiscalSuggestion) => {
    setFormData((prev) => ({
      ...prev,
      apellidosNombresFiscal: item.fiscal,
      unidadEspecializadaFiscalia: "",
    }));
    setFiscalSugerencias([]);
    setCodFiscalSeleccionado(item.cod);
    await cargarFiscaliasPorFiscal(item.fiscal);
  };

  const handleUnidadFiscaliaChange = (value: string) => {
    if (value === "__NUEVA_FISCALIA__") {
      setNuevaFiscaliaNumfis("");
      setNuevoFiscalCod(codFiscalSeleccionado);
      setMostrarModalNuevaFiscalia(true);
      return;
    }

    handleChange("unidadEspecializadaFiscalia", value);
  };

  const guardarNuevaFiscalia = async () => {
    const fiscal = formData.apellidosNombresFiscal.trim().toUpperCase();
    const numfis = nuevaFiscaliaNumfis.replace(/\D/g, "");
    const cod = nuevoFiscalCod.replace(/\D/g, "");

    if (!fiscal) {
      setNotification({ message: "Primero selecciona un fiscal", type: "info" });
      return;
    }

    if (!numfis) {
      setNotification({ message: "Ingresa el numero de fiscalia", type: "info" });
      return;
    }

    if (!cod) {
      setNotification({ message: "Ingresa el COD del fiscal", type: "info" });
      return;
    }

    const { error } = await supabase.from("fiscal").insert([
      {
        FISCAL: fiscal,
        NUMFIS: numfis,
        COD: cod,
      },
    ]);

    if (error) {
      if (/row-level security policy|permission denied|401|unauthorized/i.test(error.message)) {
        setNotification({
          message: "No se pudo guardar por politica RLS en tabla fiscal. Debes habilitar INSERT para rol anon/authenticated en Supabase.",
          type: "error",
        });
        return;
      }

      setNotification({ message: `No se pudo guardar la nueva fiscalia: ${error.message}`, type: "error" });
      return;
    }

    const { data: verificacion, error: errorVerificacion } = await supabase
      .from("fiscal")
      .select("FISCAL, NUMFIS, COD")
      .eq("FISCAL", fiscal)
      .eq("NUMFIS", numfis)
      .eq("COD", cod)
      .limit(1);

    if (errorVerificacion || (verificacion || []).length === 0) {
      setNotification({
        message: "No se pudo verificar el guardado en tabla fiscal. Revisa permisos RLS o nombres de columnas.",
        type: "error",
      });
      return;
    }

    setMostrarModalNuevaFiscalia(false);
    setNotification({ message: `Fiscalia guardada en fiscal: ${fiscal} | NUMFIS ${numfis} | COD ${cod}`, type: "success" });
    await cargarFiscaliasPorFiscal(fiscal);
    setFormData((prev) => ({ ...prev, unidadEspecializadaFiscalia: numfis }));
    setCodFiscalSeleccionado(cod);
  };

  const abrirModalNuevoFiscal = () => {
    setNuevoFiscalNombreCompleto(formData.apellidosNombresFiscal || "");
    setNuevoFiscalNumfis(formData.unidadEspecializadaFiscalia || "");
    setNuevoFiscalCodCompleto(codFiscalSeleccionado || "");
    setMostrarModalNuevoFiscal(true);
  };

  const guardarNuevoFiscalCompleto = async () => {
    const fiscal = nuevoFiscalNombreCompleto.trim().toUpperCase();
    const numfis = nuevoFiscalNumfis.replace(/\D/g, "");
    const cod = nuevoFiscalCodCompleto.replace(/\D/g, "");

    if (!fiscal) {
      setNotification({ message: "Ingresa el nombre completo del fiscal", type: "info" });
      return;
    }

    if (!numfis) {
      setNotification({ message: "Ingresa el NUMFIS", type: "info" });
      return;
    }

    if (!cod) {
      setNotification({ message: "Ingresa el COD del fiscal", type: "info" });
      return;
    }

    const { error } = await supabase.from("fiscal").insert([
      {
        FISCAL: fiscal,
        NUMFIS: numfis,
        COD: cod,
      },
    ]);

    if (error) {
      if (/row-level security policy|permission denied|401|unauthorized/i.test(error.message)) {
        setNotification({
          message: "No se pudo guardar por politica RLS en tabla fiscal. Debes habilitar INSERT para rol anon/authenticated en Supabase.",
          type: "error",
        });
        return;
      }

      setNotification({ message: `No se pudo guardar el fiscal: ${error.message}`, type: "error" });
      return;
    }

    setMostrarModalNuevoFiscal(false);
    setNotification({ message: "Fiscal agregado correctamente", type: "success" });
    setFormData((prev) => ({
      ...prev,
      apellidosNombresFiscal: fiscal,
      unidadEspecializadaFiscalia: numfis,
    }));
    setCodFiscalSeleccionado(cod);
    setFiscalSugerencias([]);
    await cargarFiscaliasPorFiscal(fiscal);
    setFormData((prev) => ({ ...prev, unidadEspecializadaFiscalia: numfis }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    if (!formData.apellidosNombresFiscal.trim() || !formData.unidadEspecializadaFiscalia.trim()) {
      setIsSaving(false);
      setNotification({ message: "Completa Fiscal y Unidad fiscalia antes de guardar", type: "info" });
      return;
    }

    if (formData.ifAnio.trim().length !== 4) {
      setIsSaving(false);
      setNotification({ message: "El ano debe tener 4 digitos", type: "info" });
      return;
    }

    const unidadFiscaliaFormateada = formatearUnidadParaFlagrancia(formData.unidadEspecializadaFiscalia);

    const payload = {
      "MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES": formData.mesIngresoDisposicionesFiscales,
      "IF": ifCompleto,
      "ZONA_(SEGÚN_SENPLADES)": ZONA_CONSTANTE,
      "PROVINCIA": PROVINCIA_CONSTANTE,
      "CANTÓN": CANTON_CONSTANTE,
      "COD._DISTRITO": formData.codDistrito,
      "DISTRITO": formData.distrito,
      "GRADO": formData.grado,
      "PERITO": formData.perito,
      "TIPO_DE_DELITO": formData.tipoDelito,
      "DELITO_TIPIFICADO_EN_DELEGACION": formData.delitoTipificadoEnDelegacion,
      "DELITO_DESAGREGACION_POLICIA_JUDICIAL": formData.delitoDesagregacionPoliciaJudicial,
      "FECHA_DE_LA_INFRACIÓN_DELITO": fechaInfraccionCompleta,
      "DETENIDO": formData.detenido.trim(),
      "CONDICIÓN_DEL_INFRACTOR_INVOLUCRADO": "DETENIDO",
      "APELLIDOS_Y_NOMBRES_DEL_FISCAL": formData.apellidosNombresFiscal.trim().toUpperCase(),
      "UNIDAD_ESPECIALIZADA_DE_FISCALIA": unidadFiscaliaFormateada,
      "F_DELEGACION": fDelegacionCompleta || null,
      "F_RECEPCION": fRecepcionCompleta || null,
      "FECHA_DE_RECEPCION_POR_PARTE_AGENTE_INVESTIGADOR": fechaRecepcionAgenteCompleta || null,
      "F_AUDICENCIA": formData.fAudicencia ? new Date(formData.fAudicencia).toISOString() : null,
      "Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE": formData.numeroOficioRecibeDiligenciaAgente,
      "PLAZO_DIAS": "3 DIAS",
    };

    let error = null as { message: string } | null;

    if (mode === "edit") {
      if (!editId) {
        setIsSaving(false);
        setNotification({ message: "No se pudo editar: falta id del registro", type: "error" });
        return;
      }
      const resp = await supabase.from("FLAGRANCIA").update(payload).eq("id", editId);
      error = (resp.error as { message: string } | null);
    } else {
      const resp = await supabase.from("FLAGRANCIA").insert([payload]);
      error = (resp.error as { message: string } | null);
    }

    // Fallback: si la columna UNIDAD... es numerica en esta BD, reintentamos con numero.
    if (error && /UNIDAD_ESPECIALIZADA_DE_FISCALIA|invalid input syntax|integer|numeric|type/i.test(error.message)) {
      const payloadConUnidadNumerica = {
        ...payload,
        "UNIDAD_ESPECIALIZADA_DE_FISCALIA": Number(formData.unidadEspecializadaFiscalia),
      };
      if (mode === "edit") {
        const reintento = await supabase.from("FLAGRANCIA").update(payloadConUnidadNumerica).eq("id", editId);
        error = (reintento.error as { message: string } | null);
      } else {
        const reintento = await supabase.from("FLAGRANCIA").insert([payloadConUnidadNumerica]);
        error = (reintento.error as { message: string } | null);
      }
    }

    setIsSaving(false);
    if (error) {
      setNotification({
        message: /duplicate|unique|already exists|23505/i.test(error.message)
          ? `El IF ya existe en FLAGRANCIA. Verifica el secuencial.`
          : `Error al guardar en FLAGRANCIA: ${error.message}`,
        type: "error",
      });
      return;
    }

    setNotification({ message: mode === "edit" ? "Registro actualizado en FLAGRANCIA" : "Registro guardado en FLAGRANCIA", type: "success" });
    setPeritoSugerencias([]);
    setDelitoSugerencias([]);
    setFiscalSugerencias([]);
    setFiscaliasDisponibles([]);
    setCodFiscalSeleccionado("");

    if (mode === "edit") {
      onSavedEdit?.();
      return;
    }

    setFormData((prev) => ({
      ...initialState,
      mesIngresoDisposicionesFiscales: prev.mesIngresoDisposicionesFiscales,
      anioCabecera: prev.anioCabecera,
      ifAnio: prev.ifAnio,
      fechaInfraccionAnio: prev.fechaInfraccionAnio,
      fDelegacionAnio: prev.fDelegacionAnio,
      fDelegacionMes: prev.fDelegacionMes,
      fDelegacionDia: prev.fDelegacionDia,
      fRecepcionAnio: prev.fRecepcionAnio,
      fRecepcionMes: prev.fRecepcionMes,
      fRecepcionDia: prev.fRecepcionDia,
      fechaRecepcionAgenteInvestigadorAnio: prev.fechaRecepcionAgenteInvestigadorAnio,
      fechaRecepcionAgenteInvestigadorMes: prev.fechaRecepcionAgenteInvestigadorMes,
      fechaRecepcionAgenteInvestigadorDia: prev.fechaRecepcionAgenteInvestigadorDia,
    }));
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
      <form onSubmit={handleSubmit} className="bg-white/5 rounded-3xl p-5 md:p-6 border border-white/5 space-y-5 animate-in fade-in duration-500 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <h3 className="text-sm font-black text-indigo-300 uppercase tracking-wider">
            {mode === "edit" ? "Editar Delegaciones Diarias" : "Delegaciones Diarias"}
          </h3>
          <p className="text-[10px] text-white/40 uppercase tracking-wide mt-1">
            {mode === "edit" ? "Actualizacion en FLAGRANCIA" : "Guardado en FLAGRANCIA"}
          </p>
        </div>
        <div className="space-y-1 w-full md:w-40">
          <label className="text-[10px] font-bold text-white/40 uppercase">Ano</label>
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={formData.anioCabecera}
            onChange={(e) => handleChange("anioCabecera", e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder={String(new Date().getFullYear())}
            className="w-full bg-neutral-900 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono tracking-widest text-center"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-[7.5rem_13.5rem_6.5rem_7rem_4.5rem_minmax(12rem,1fr)] gap-2 items-start">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">Mes ingreso</label>
          <select
            value={formData.mesIngresoDisposicionesFiscales}
            onChange={(e) => handleChange("mesIngresoDisposicionesFiscales", e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
          >
            {MONTH_OPTIONS.map((mes) => (
              <option key={mes} value={mes} className="text-black bg-white">
                {mes}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">IF</label>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500">
            <span className="bg-white/10 px-2 py-2.5 text-xs text-white/50 font-mono">{IF_PREFIX}</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={formData.ifAnio}
              onChange={(e) => handleChange("ifAnio", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={String(new Date().getFullYear())}
              className="w-12 bg-neutral-900 border-x border-white/10 px-1 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={formData.ifSecuencial}
              onChange={(e) => handleChange("ifSecuencial", e.target.value.replace(/\D/g, "").slice(0, 6))}
              required
              placeholder="000000"
              className="flex-1 min-w-0 bg-transparent px-2 py-2.5 text-xs text-white outline-none font-mono"
            />
          </div>
          <p className="text-xs text-white/50 font-mono tracking-wider truncate">{ifCompleto}</p>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">Cod. Distrito</label>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500">
            <span className="bg-white/10 px-2 py-2.5 text-xs text-white/50 font-mono">{COD_DISTRITO_PREFIX}</span>
            <select
              value={codDistritoSufijo}
              onChange={(e) => handleCodDistritoChange(e.target.value)}
              className="flex-1 bg-neutral-900 border-l border-white/10 px-1 py-2.5 text-xs text-white outline-none"
              required
            >
                <option value="" className="text-black bg-white">--</option>
              {COD_DISTRITO_OPTIONS.map((codigo) => (
                  <option key={codigo} value={codigo} className="text-black bg-white">
                  {codigo}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">Distrito</label>
          <input
            type="text"
            value={formData.distrito}
            readOnly
            tabIndex={-1}
            placeholder="Auto"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white/80 outline-none truncate"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">Grado</label>
          <input
            type="text"
            value={formData.grado}
            readOnly
            tabIndex={-1}
            placeholder="Auto"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white/80 outline-none font-mono"
          />
        </div>

        <div className="space-y-1 relative">
          <label className="text-[10px] font-bold text-white/40 uppercase">Perito</label>
          <input
            type="text"
            value={formData.perito}
            onChange={(e) => buscarPeritos(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && peritoSugerencias.length === 1) {
                e.preventDefault();
                seleccionarPerito(peritoSugerencias[0]);
              }
            }}
            required
            placeholder="Buscar perito..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
          />
          {peritoSugerencias.length > 0 && (
            <ul className="absolute z-50 w-full bg-neutral-950 border border-white/10 rounded-xl mt-1 shadow-2xl max-h-40 overflow-y-auto custom-scrollbar">
              {peritoSugerencias.map((item, index) => (
                <li
                  key={`${item.perito}-${index}`}
                  onClick={() => seleccionarPerito(item)}
                  className="p-2 text-[10px] text-white hover:bg-indigo-600 cursor-pointer border-b border-white/5 last:border-none transition-colors"
                >
                  {item.perito}
                </li>
              ))}
            </ul>
          )}
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-[minmax(12rem,1fr)_9rem_minmax(10rem,1fr)] gap-2 items-start">
        <div className="space-y-1 relative">
          <label className="text-[10px] font-bold text-white/40 uppercase">Delito desagregado</label>
          <input
            type="text"
            value={formData.delitoDesagregacionPoliciaJudicial}
            onChange={(e) => buscarDelitos(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && delitoSugerencias.length === 1) {
                e.preventDefault();
                seleccionarDelito(delitoSugerencias[0]);
              }
            }}
            placeholder="Buscar delito..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
          />
          {delitoSugerencias.length > 0 && (
            <ul className="absolute z-50 w-full bg-neutral-950 border border-white/10 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
              {delitoSugerencias.map((item, index) => (
                <li
                  key={`${item.DELITO}-${index}`}
                  onClick={() => seleccionarDelito(item)}
                  className="p-2 text-[10px] text-white hover:bg-indigo-600 cursor-pointer border-b border-white/5 last:border-none transition-colors"
                >
                  {item.DELITO}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">Tipo delito</label>
          <input
            type="text"
            value={formData.tipoDelito}
            readOnly
            tabIndex={-1}
            placeholder="Auto"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white/80 outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">Delito tipificado</label>
          <input
            type="text"
            value={formData.delitoTipificadoEnDelegacion}
            readOnly
            tabIndex={-1}
            placeholder="Auto"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-xs text-white/80 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[15rem_minmax(18rem,1fr)_12rem] gap-3 xl:gap-4 items-start">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">Fecha infraccion</label>
          <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={formData.fechaInfraccionAnio}
              onChange={(e) => handleChange("fechaInfraccionAnio", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="AAAA"
              className="w-16 bg-white/10 border-r border-white/10 px-2 py-2.5 text-xs text-white/70 outline-none font-mono text-center focus:bg-white/20 focus:text-white"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={formData.fechaInfraccionMes}
              onChange={(e) => handleChange("fechaInfraccionMes", e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={(e) => { if (e.target.value.length === 1) handleChange("fechaInfraccionMes", e.target.value.padStart(2, "0")); }}
              required
              placeholder="MM"
              className="w-12 bg-neutral-900 border-x border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={formData.fechaInfraccionDia}
              onChange={(e) => handleChange("fechaInfraccionDia", e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={(e) => { if (e.target.value.length === 1) handleChange("fechaInfraccionDia", e.target.value.padStart(2, "0")); }}
              required
              placeholder="DD"
              className="w-12 bg-neutral-900 border-l border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">Detenido</label>
          <textarea
            value={formData.detenido}
            onChange={(e) => handleDetenidoChange(e.target.value)}
            required
            rows={2}
            placeholder="Nombres del detenido..."
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500 resize-none custom-scrollbar"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(20rem,1.2fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_minmax(12rem,1fr)] gap-3 xl:gap-4 items-start">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 xl:gap-4 items-start">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/40 uppercase">Fiscal</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={abrirModalNuevoFiscal}
                className="h-9 w-9 shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm leading-none"
                title="Agregar fiscal"
              >
                +
              </button>
              <div className="relative flex-1">
                <input
                  type="text"
                  value={formData.apellidosNombresFiscal}
                  onChange={(e) => buscarFiscales(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && fiscalSugerencias.length === 1) {
                      e.preventDefault();
                      void seleccionarFiscal(fiscalSugerencias[0]);
                    }
                  }}
                  required
                  placeholder="Buscar fiscal..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                />
                {fiscalSugerencias.length > 0 && (
                  <ul className="absolute z-50 w-full bg-neutral-950 border border-white/10 rounded-xl mt-1 shadow-2xl max-h-48 overflow-y-auto custom-scrollbar">
                    {fiscalSugerencias.map((item, index) => (
                      <li
                        key={`${item.fiscal}-${index}`}
                        onClick={() => seleccionarFiscal(item)}
                        className="p-2 text-[10px] text-white hover:bg-indigo-600 cursor-pointer border-b border-white/5 last:border-none transition-colors"
                      >
                        {item.fiscal}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-white/40 uppercase">Unidad fiscalia (NUMFIS)</label>
            <select
              value={formData.unidadEspecializadaFiscalia}
              onChange={(e) => handleUnidadFiscaliaChange(e.target.value)}
              required
              disabled={!formData.apellidosNombresFiscal}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500 disabled:text-white/40 disabled:cursor-not-allowed"
            >
              <option value="" className="text-black bg-white">Seleccione</option>
              {fiscaliasDisponibles.map((numfis) => (
                <option key={numfis} value={numfis} className="text-black bg-white">
                  {numfis}
                </option>
              ))}
              <option value="__NUEVA_FISCALIA__" className="text-black bg-white">+ Agregar nueva fiscalia</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">F. delegacion</label>
          <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={formData.fDelegacionAnio}
              onChange={(e) => handleChange("fDelegacionAnio", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="AAAA"
              className="w-16 bg-white/10 border-r border-white/10 px-2 py-2.5 text-xs text-white/70 outline-none font-mono text-center focus:bg-white/20 focus:text-white"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={formData.fDelegacionMes}
              onChange={(e) => handleChange("fDelegacionMes", e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={(e) => { if (e.target.value.length === 1) handleChange("fDelegacionMes", e.target.value.padStart(2, "0")); }}
              required
              placeholder="MM"
              className="w-12 bg-neutral-900 border-x border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={formData.fDelegacionDia}
              onChange={(e) => handleChange("fDelegacionDia", e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={(e) => { if (e.target.value.length === 1) handleChange("fDelegacionDia", e.target.value.padStart(2, "0")); }}
              required
              placeholder="DD"
              className="w-12 bg-neutral-900 border-l border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">F. recepcion</label>
          <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={formData.fRecepcionAnio}
              onChange={(e) => handleChange("fRecepcionAnio", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="AAAA"
              className="w-16 bg-white/10 border-r border-white/10 px-2 py-2.5 text-xs text-white/70 outline-none font-mono text-center focus:bg-white/20 focus:text-white"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={formData.fRecepcionMes}
              onChange={(e) => handleChange("fRecepcionMes", e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={(e) => { if (e.target.value.length === 1) handleChange("fRecepcionMes", e.target.value.padStart(2, "0")); }}
              required
              placeholder="MM"
              className="w-12 bg-neutral-900 border-x border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={formData.fRecepcionDia}
              onChange={(e) => handleChange("fRecepcionDia", e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={(e) => { if (e.target.value.length === 1) handleChange("fRecepcionDia", e.target.value.padStart(2, "0")); }}
              required
              placeholder="DD"
              className="w-12 bg-neutral-900 border-l border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">F. recepcion agente</label>
          <div className="inline-flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-indigo-500">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={formData.fechaRecepcionAgenteInvestigadorAnio}
              onChange={(e) => handleChange("fechaRecepcionAgenteInvestigadorAnio", e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="AAAA"
              className="w-16 bg-white/10 border-r border-white/10 px-2 py-2.5 text-xs text-white/70 outline-none font-mono text-center focus:bg-white/20 focus:text-white"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={formData.fechaRecepcionAgenteInvestigadorMes}
              onChange={(e) => handleChange("fechaRecepcionAgenteInvestigadorMes", e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={(e) => { if (e.target.value.length === 1) handleChange("fechaRecepcionAgenteInvestigadorMes", e.target.value.padStart(2, "0")); }}
              required
              placeholder="MM"
              className="w-12 bg-neutral-900 border-x border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
            <input
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={formData.fechaRecepcionAgenteInvestigadorDia}
              onChange={(e) => handleChange("fechaRecepcionAgenteInvestigadorDia", e.target.value.replace(/\D/g, "").slice(0, 2))}
              onBlur={(e) => { if (e.target.value.length === 1) handleChange("fechaRecepcionAgenteInvestigadorDia", e.target.value.padStart(2, "0")); }}
              required
              placeholder="DD"
              className="w-12 bg-neutral-900 border-l border-white/10 px-2 py-2.5 text-xs text-white outline-none font-mono text-center"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-white/40 uppercase">F. audicencia (fecha y hora)</label>
          <input
            type="datetime-local"
            value={formData.fAudicencia}
            onChange={(e) => handleChange("fAudicencia", e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
          />
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 xl:gap-4">
        {fields.map((field) => (
          <div
            key={field.key}
            className={`space-y-1 ${field.gridClass || ""}`}
          >
            <label className="text-[10px] font-bold text-white/40 uppercase">{field.label}</label>
            {field.key === "numeroOficioRecibeDiligenciaAgente" ? (
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={formData.numeroOficioRecibeDiligenciaAgente}
                onChange={(e) => handleChange("numeroOficioRecibeDiligenciaAgente", e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                placeholder="000000"
                className="w-full max-w-[8rem] bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500 font-mono"
              />
            ) : (
              <input
                type={field.type || "text"}
                value={formData[field.key]}
                onChange={(e) => handleChange(field.key, e.target.value)}
                required={field.key !== "delitoDesagregacionPoliciaJudicial"}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
              />
            )}
          </div>
        ))}
      </div>

      <div className="pt-1 flex justify-end">
        {mode === "edit" && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all bg-white/10 hover:bg-white/20 text-white mr-2"
          >
            Cancelar Edicion
          </button>
        )}
        <button
          type="submit"
          disabled={isSaving}
          className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
            isSaving ? "bg-white/20 text-white/50 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500 text-white"
          }`}
        >
          {isSaving ? "Guardando..." : mode === "edit" ? "Actualizar FLAGRANCIA" : "Guardar en FLAGRANCIA"}
        </button>
      </div>
      </form>

      {mostrarModalNuevaFiscalia && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-neutral-950 shadow-2xl">
            <div className="p-4 border-b border-white/10">
              <h4 className="text-sm font-bold text-white">Agregar nueva fiscalia</h4>
              <p className="text-[10px] text-white/50 mt-1">{formData.apellidosNombresFiscal}</p>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">NUMFIS</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={nuevaFiscaliaNumfis}
                  onChange={(e) => setNuevaFiscaliaNumfis(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ej: 7"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">COD</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={nuevoFiscalCod}
                  onChange={(e) => setNuevoFiscalCod(e.target.value.replace(/\D/g, ""))}
                  placeholder="Ej: 2945"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarModalNuevaFiscalia(false)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarNuevaFiscalia}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalNuevoFiscal && (
        <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-neutral-950 shadow-2xl">
            <div className="p-4 border-b border-white/10">
              <h4 className="text-sm font-bold text-white">Agregar fiscal nuevo</h4>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-white/40 uppercase">Nombre completo (incluye AB.)</label>
                <input
                  type="text"
                  value={nuevoFiscalNombreCompleto}
                  onChange={(e) => setNuevoFiscalNombreCompleto(e.target.value.toUpperCase())}
                  placeholder="AB. APELLIDOS NOMBRES"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase">NUMFIS</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={nuevoFiscalNumfis}
                    onChange={(e) => setNuevoFiscalNumfis(e.target.value.replace(/\D/g, ""))}
                    placeholder="Ej: 4"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-white/40 uppercase">COD</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={nuevoFiscalCodCompleto}
                    onChange={(e) => setNuevoFiscalCodCompleto(e.target.value.replace(/\D/g, ""))}
                    placeholder="Ej: 2945"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-white/10 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMostrarModalNuevoFiscal(false)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-xs font-semibold uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarNuevoFiscalCompleto}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
