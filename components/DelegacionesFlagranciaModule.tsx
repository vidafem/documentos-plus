"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { supabase } from "@/lib/supabaseClient";
import Notification from "./Notification";

type GenericRow = Record<string, string | number | null>;
const BASE_YEAR = 2026;

const DELEGACIONES_HEADERS = [
  "ORDEN",
  "MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES",
  "FASE_PREPROCESAL_O_PROCESAL",
  "_NÚMERO_DELEGACIÓN_FISCAL",
  "NUMERO_DE_PROCESO",
  "ZONA_(SEGÚN_SENPLADES)",
  "PROVINCIA",
  "CANTÓN",
  "COD._DISTRITO",
  "DISTRITO_",
  "GRADO",
  "_NOMBRES_AGENTE_DELEGADO",
  "DIRECCIÓN_POLICAL",
  "UNIDAD_POLICIAL",
  "TIPO_DE_DELITO",
  "DELITO_TIPIFICADO_EN_DELEGACION",
  "DELITO_DESAGREGACION_POLICIA_JUDICIAL",
  "ART._DELITO",
  "FECHA_DE_LA_INFRACIÓN/DELITO",
  "APELLIDOS_Y_NOMBRES_DE_LA_VÍCTIMA",
  "SEXO_(VÍCTIMA)",
  "EDAD_(VÍCTIMA)",
  "APELLIDOS_Y_NOMBRES_DEL_DETENIDO_O_SOPECHOSO",
  "CONDICIÓN_DEL_INFRACTOR_INVOLUCRADO",
  "PARENTESCO_DEL_DETENIDO_O_SOPECHOSO_CON_LA_VICTIMA",
  "ALIAS_DEL_SOSPECHOSO",
  "PLACA_DEL_VEHÍCULO_INVOLUCRADO_EN_EL_DELITO",
  "APELLIDOS_Y_NOMBRES_DEL_FISCAL",
  "UNIDAD_ESPECIALIZADA_DE_FISCALIA",
  "NÚMERO_CORRESPONDIENTE_DE_FISCALÍA",
  "FECHA_DE_LA_DELEGACION",
  "FECHA_DE_RECEPCIÓN_EN_LA_PJ",
  "FECHA_DE_RECEPCION_POR_PARTE_AGENTE_INVESTIGADOR",
  "Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE",
  "PLAZO_OTORGADO_(DIAS)",
  "Nª_ART._446_Y_511_COIP._No._1,2,5,6",
  "QUE_ART._CUMPLIO_DENTRO_DEL_PLAZO?_2,4,6,8,12,14",
  "CUMPLIMIENTO_PARCIAL",
  "CUMPLIMIENTO_TOTAL",
  "FECHA_CUMPLIMIENTO_O_DESCARGO_DE_DELEGACION",
  "EN_INVESTIGACION",
  "NUMERO_DE_OFICIO_DE_DESCARGO",
  "VERSIONES_(NUMERO)",
  "RECONOCIMIENTOS_DE_LUGAR_DE_LOS_HECHOS_(NUMERO)",
  "SE_IDENTIFICÓ_AL_O_LOS_RESPONSABLES",
  "COMPARECENCIA_DEL_SOSPECHOSO",
  "PETICIONES_A_FISCALIA",
  "TIPO_DE_PETICION",
  "No._DE_BOLETAS_SOLICITADAS_A_LA_AUTORIDAD_COMPETENTE",
  "APELLIDOS_Y_NOMBRES_DE_LAS_PERSONAS_SOSPECHOSAS_QUE_SE_HA_EMITIDO_BOLETA_DE_CAPTURA",
  "NUMERO_DE_DETENIDOS_PRODUCTO_DE_LA_INVESTIGACION",
  "APELLIDOS_Y_NOMBRES_DE_LOS_DETENIDOS_PRODUCTO_DEL_CUMPLIMIENTO_DE_LA_DISPOSICION_FISCAL",
  "ALLANAMIENTOS_(NUMERO)",
  "RECUPERACION_DE_BIENES_O_EVIDENCIAS_(NUMERO)",
  "RECUPERACION_DE_AUTOMOTORES_(NUMERO)",
  "RECUPERACION_OTROS_(NUMERO)",
  "PERITAJES_(NUMERO)",
  "NOTIFICACIONES_(EN_NÚMERO)",
  "CITACIONES_(EN_NÚMERO)",
  "TRASLADOS__(EN_NÚMERO)",
  "INFORME_O_DESCARGO",
  "CAUSAS_DEL_INCUMPLIMIENTO_DE_LA_INVESTIGACIÓN",
  "NOMBRE_DE_LOS_DETENIDOS_PRODUCTO_DE_LA_INVESTIGACION",
  "CON_RESULTADOS",
  "CUMPLE/NO_CUMPLE",
  "NUDO_CRÍTICO",
  "OBSERVACIONES",
  "REGISTRA",
  "DELITO/DELEGACION",
  "DELEGACION/RECEPCI",
  "RECEPCION/AGENTE",
  "AGENTE/CUMPLIMIENTO",
  "AÑO_DE_RECEPCION_POR_",
  "AÑO_DE_CUMPLIMIENTO",
] as const;

const DELEGACIONES_INSERT_COLUMNS = [
  "ORDEN",
  "MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES",
  "FASE_PREPROCESAL_O_PROCESAL",
  "_NÚMERO_DELEGACIÓN_FISCAL",
  "ZONA_(SEGÚN_SENPLADES)",
  "PROVINCIA",
  "CANTÓN",
    "COD._DISTRITO",
    "DISTRITO_",
  "GRADO",
  "_NOMBRES_AGENTE_DELEGADO",
    "DIRECCIÓN_POLICAL",
    "UNIDAD_POLICIAL",
    "TIPO_DE_DELITO",
    "DELITO_TIPIFICADO_EN_DELEGACION",
    "DELITO_DESAGREGACION_POLICIA_JUDICIAL",
    "ART._DELITO",
    "FECHA_DE_LA_INFRACIÓN/DELITO",
    "APELLIDOS_Y_NOMBRES_DE_LA_VÍCTIMA",
    "SEXO_(VÍCTIMA)",
    "EDAD_(VÍCTIMA)",
    "APELLIDOS_Y_NOMBRES_DEL_DETENIDO_O_SOPECHOSO",
    "CONDICIÓN_DEL_INFRACTOR_INVOLUCRADO",
    "PARENTESCO_DEL_DETENIDO_O_SOPECHOSO_CON_LA_VICTIMA",
    "APELLIDOS_Y_NOMBRES_DEL_FISCAL",
    "UNIDAD_ESPECIALIZADA_DE_FISCALIA",
    "NÚMERO_CORRESPONDIENTE_DE_FISCALÍA",
    "FECHA_DE_LA_DELEGACION",
    "Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE",
    "PLAZO_OTORGADO_(DIAS)",
    "Nª_ART._446_Y_511_COIP._No._1,2,5,6",
    "QUE_ART._CUMPLIO_DENTRO_DEL_PLAZO?_2,4,6,8,12,14",
    "CUMPLIMIENTO_PARCIAL",
    "CUMPLIMIENTO_TOTAL",
    "FECHA_CUMPLIMIENTO_O_DESCARGO_DE_DELEGACION",
    "NUMERO_DE_OFICIO_DE_DESCARGO",
    "RECONOCIMIENTOS_DE_LUGAR_DE_LOS_HECHOS_(NUMERO)",
    "INFORME_O_DESCARGO",
    "DELITO/DELEGACION",
    "DELEGACION/RECEPCI",
    "RECEPCION/AGENTE",
    "AGENTE/CUMPLIMIENTO",
    "AÑO_DE_RECEPCION_POR_",
    "AÑO_DE_CUMPLIMIENTO",
  "FECHA_DE_RECEPCIÓN_EN_LA_PJ",
    "FECHA_DE_RECEPCION_POR_PARTE_AGENTE_INVESTIGADOR",
] as const;

const RED_IF_FILLED_COLUMNS = new Set([
  "DELITO/DELEGACION",
  "DELEGACION/RECEPCI",
  "RECEPCION/AGENTE",
  "AGENTE/CUMPLIMIENTO",
  "AÑO_DE_RECEPCION_POR_",
  "AÑO_DE_CUMPLIMIENTO",
]);

const normalizeDateValue = (value: string): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const firstChunk = raw.split(" ")[0];
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(firstChunk)) {
    const [y, m, d] = firstChunk.split(/[/-]/);
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(firstChunk)) {
    const [d, m, y] = firstChunk.split(/[/-]/);
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
};

const isoDateToExcelSerial = (value: string): number | null => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return null;
  const [yearText, monthText, dayText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const utcValue = Date.UTC(year, month - 1, day);
  const excelEpoch = Date.UTC(1899, 11, 30);
  return (utcValue - excelEpoch) / 86400000;
};

const EDITABLE_FIELDS = DELEGACIONES_HEADERS.filter((header) => header !== "ORDEN");

const getYear = (value: unknown): string => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  const firstPart = raw.split(/[/-]/)[0] || "";
  return /^\d{4}$/.test(firstPart) ? firstPart : "";
};

const toText = (value: unknown): string => String(value ?? "");

const normalizeLookupKey = (value: unknown): string =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const extractFiscalNumber = (value: unknown): string => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const matches = text.match(/\d+/g);
  return matches && matches.length > 0 ? matches[matches.length - 1] : "";
};

const extractOfficioSixDigits = (value: unknown): string => {
  const text = String(value ?? "");
  const digits = text.replace(/\D/g, "");
  if (!digits) return "000000";
  return digits.slice(-6).padStart(6, "0");
};

const extractOfficioFourDigits = (value: unknown): string => {
  const text = String(value ?? "");
  const digits = text.replace(/\D/g, "");
  if (!digits) return "0000";
  return digits.slice(-4).padStart(4, "0");
};

const buildFiscalKey = (fiscal: unknown, numfis: unknown): string =>
  `${normalizeLookupKey(fiscal)}|${String(numfis ?? "").trim()}`;

const parseDateToSortableNumber = (value: unknown): number | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parts = raw.split(/[/-]/).map((p) => p.trim());
  if (parts.length < 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return year * 10000 + month * 100 + day;
};

const getRecepcionDateFromFlagrancia = (row: GenericRow): string =>
  toText(row["FECHA_DE_RECEPCIÓN_EN_LA_PJ"] ?? row["F_RECEPCION"] ?? "");

const isFromYearOnward = (value: unknown, year: number): boolean => {
  const parsedYear = Number(getYear(value));
  return Number.isFinite(parsedYear) && parsedYear >= year;
};

const mapFlagranciaToDelegaciones = (
  row: GenericRow,
  index: number,
  articulosByDelito: Map<string, string>,
  fiscalCodByKey: Map<string, string>
): Record<string, string> => {
  const output: Record<string, string> = {};

  DELEGACIONES_HEADERS.forEach((header) => {
    output[header] = "";
  });

  output["ORDEN"] = toText(row.id ?? index + 1);
  output["MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES"] = toText(row["MES_DE_INGRESO_DE_DISPOSICIONES_FISCALES"]);
  output["FASE_PREPROCESAL_O_PROCESAL"] = toText(row["FECHA_ORIGINAL_DEL_OFICIO"]);
  output["_NÚMERO_DELEGACIÓN_FISCAL"] = toText(row["IF"]);
  output["ZONA_(SEGÚN_SENPLADES)"] = toText(row["ZONA_(SEGÚN_SENPLADES)"]);
  output["PROVINCIA"] = toText(row["PROVINCIA"]);
  output["CANTÓN"] = toText(row["CANTÓN"]);
  output["COD._DISTRITO"] = toText(row["COD._DISTRITO"]);
  output["DISTRITO_"] = toText(row["DISTRITO"]);
  output["GRADO"] = toText(row["GRADO"]);
  output["_NOMBRES_AGENTE_DELEGADO"] = toText(row["PERITO"]);
  output["DIRECCIÓN_POLICAL"] = "DNPJ";
  output["UNIDAD_POLICIAL"] = "POLICÍA JUDICIAL";
  output["TIPO_DE_DELITO"] = toText(row["TIPO_DE_DELITO"]);
  output["DELITO_TIPIFICADO_EN_DELEGACION"] = toText(row["DELITO_TIPIFICADO_EN_DELEGACION"]);
  output["DELITO_DESAGREGACION_POLICIA_JUDICIAL"] = toText(row["DELITO_DESAGREGACION_POLICIA_JUDICIAL"]);
  const delitoKey = normalizeLookupKey(row["DELITO_DESAGREGACION_POLICIA_JUDICIAL"]);
  output["ART._DELITO"] = articulosByDelito.get(delitoKey) || "";
  output["FECHA_DE_LA_INFRACIÓN/DELITO"] = toText(row["FECHA_DE_LA_INFRACIÓN_DELITO"]);
  output["APELLIDOS_Y_NOMBRES_DE_LA_VÍCTIMA"] = "";
  output["SEXO_(VÍCTIMA)"] = "";
  output["EDAD_(VÍCTIMA)"] = "";
  output["APELLIDOS_Y_NOMBRES_DEL_DETENIDO_O_SOPECHOSO"] = toText(row["DETENIDO"]);
  output["CONDICIÓN_DEL_INFRACTOR_INVOLUCRADO"] = "PROCESADO/A";
  output["PARENTESCO_DEL_DETENIDO_O_SOPECHOSO_CON_LA_VICTIMA"] = "DESCONOCIDO";
  output["APELLIDOS_Y_NOMBRES_DEL_FISCAL"] = toText(row["APELLIDOS_Y_NOMBRES_DEL_FISCAL"]);
  output["UNIDAD_ESPECIALIZADA_DE_FISCALIA"] = "UNIDAD DE FLAGRANCIA";
  const numFiscalia = extractFiscalNumber(row["UNIDAD_ESPECIALIZADA_DE_FISCALIA"]);
  output["NÚMERO_CORRESPONDIENTE_DE_FISCALÍA"] = numFiscalia;
  output["FECHA_DE_LA_DELEGACION"] = toText(row["F_DELEGACION"]);
  const anioDelegacion = getYear(row["F_DELEGACION"]);
  const fiscalKey = buildFiscalKey(row["APELLIDOS_Y_NOMBRES_DEL_FISCAL"], numFiscalia);
  const fiscalCod = fiscalCodByKey.get(fiscalKey) || "";
  const oficio6 = extractOfficioSixDigits(row["Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE"]);
  output["Nº_DE_OFICIO_CON_LA_QUE_RECIBE_LA_DILIGENCIA_EL_AGENTE"] = `FPG-FEIFO${numFiscalia || ""}-${fiscalCod || ""}-${anioDelegacion || ""}-${oficio6}-O`;
  output["FECHA_DE_RECEPCIÓN_EN_LA_PJ"] = getRecepcionDateFromFlagrancia(row);
  output["FECHA_DE_RECEPCION_POR_PARTE_AGENTE_INVESTIGADOR"] = toText(row["FECHA_DE_RECEPCION_POR_PARTE_AGENTE_INVESTIGADOR"]);
  output["PLAZO_OTORGADO_(DIAS)"] = "3";
  output["Nª_ART._446_Y_511_COIP._No._1,2,5,6"] = "1,2,5,6";
  output["QUE_ART._CUMPLIO_DENTRO_DEL_PLAZO?_2,4,6,8,12,14"] = "2,4,6";
  output["CUMPLIMIENTO_PARCIAL"] = toText(row["CUMPLIMIENTO_PARCIAL"]).trim() || "NO";
  output["CUMPLIMIENTO_TOTAL"] = toText(row["CUMPLIMIENTO_TOTAL"]).trim() || "NO";
  output["FECHA_CUMPLIMIENTO_O_DESCARGO_DE_DELEGACION"] = toText(row["EXTRACTO"]);
  const cumplimientoEsSi = normalizeLookupKey(output["CUMPLIMIENTO_TOTAL"]) === "SI";
  const reconocimientosFlag = normalizeLookupKey(row["RECONOCIMIENTOS"]);
  const reconocimientoEsSi = reconocimientosFlag === "SI" || reconocimientosFlag === "1";
  const anioDescargo = getYear(output["FECHA_CUMPLIMIENTO_O_DESCARGO_DE_DELEGACION"]);
  const oficioDescargo4 = extractOfficioFourDigits(row["OFICIO_DESCARGO"]);
  output["NUMERO_DE_OFICIO_DE_DESCARGO"] = cumplimientoEsSi && reconocimientoEsSi
    ? `PJ-ZONA8-JINVPJ-UDF-${anioDescargo || ""}-${oficioDescargo4}-O`
    : "";
  output["RECONOCIMIENTOS_DE_LUGAR_DE_LOS_HECHOS_(NUMERO)"] = cumplimientoEsSi ? "1" : "";
  output["INFORME_O_DESCARGO"] = cumplimientoEsSi && reconocimientoEsSi ? "INFORME DE CUMPLIMIENTO" : "";

  const fechaInfraccion = output["FECHA_DE_LA_INFRACIÓN/DELITO"];
  const fechaDelegacion = output["FECHA_DE_LA_DELEGACION"];
  const fechaRecepcion = output["FECHA_DE_RECEPCIÓN_EN_LA_PJ"];
  const fechaAgente = output["FECHA_DE_RECEPCION_POR_PARTE_AGENTE_INVESTIGADOR"];
  const fechaCumplimientoDescargo = output["FECHA_CUMPLIMIENTO_O_DESCARGO_DE_DELEGACION"];

  const nInfraccion = parseDateToSortableNumber(fechaInfraccion);
  const nDelegacion = parseDateToSortableNumber(fechaDelegacion);
  const nRecepcion = parseDateToSortableNumber(fechaRecepcion);
  const nAgente = parseDateToSortableNumber(fechaAgente);
  const nCumplimiento = parseDateToSortableNumber(fechaCumplimientoDescargo);

  output["DELITO/DELEGACION"] = nDelegacion !== null && nInfraccion !== null
    ? (nDelegacion >= nInfraccion ? "TRUE" : "FALSE")
    : "";
  output["DELEGACION/RECEPCI"] = nRecepcion !== null && nDelegacion !== null
    ? (nRecepcion >= nDelegacion ? "TRUE" : "FALSE")
    : "";
  output["RECEPCION/AGENTE"] = nAgente !== null && nRecepcion !== null
    ? (nAgente >= nRecepcion ? "TRUE" : "FALSE")
    : "";
  output["AGENTE/CUMPLIMIENTO"] = nCumplimiento !== null && nAgente !== null
    ? (nCumplimiento >= nAgente ? "TRUE" : "FALSE")
    : "";

  output["AÑO_DE_RECEPCION_POR_"] = getYear(fechaRecepcion);
  output["AÑO_DE_CUMPLIMIENTO"] = getYear(fechaCumplimientoDescargo);

  return output;
};

export const syncDelegacionesFromFlagranciaGlobal = async (selectedYearNum: number = BASE_YEAR): Promise<{ updatedCount: number }> => {
  const { data: delitosData, error: delitosError } = await supabase
    .from("delitos")
    .select("DELITO, ARTICULOS");

  if (delitosError) {
    throw new Error(`Error leyendo tabla delitos: ${delitosError.message}`);
  }

  const articulosByDelito = new Map<string, string>();
  ((delitosData || []) as GenericRow[]).forEach((item) => {
    const key = normalizeLookupKey(item["DELITO"]);
    if (key) {
      articulosByDelito.set(key, toText(item["ARTICULOS"]));
    }
  });

  const { data: fiscalData, error: fiscalError } = await supabase
    .from("fiscal")
    .select("FISCAL, NUMFIS, COD");

  if (fiscalError) {
    throw new Error(`Error leyendo tabla fiscal: ${fiscalError.message}`);
  }

  const fiscalCodByKey = new Map<string, string>();
  ((fiscalData || []) as GenericRow[]).forEach((item) => {
    const fiscal = toText(item["FISCAL"]);
    const numfis = extractFiscalNumber(item["NUMFIS"]);
    const cod = toText(item["COD"]).replace(/\D/g, "").slice(-4).padStart(4, "0");
    if (fiscal && numfis) {
      fiscalCodByKey.set(buildFiscalKey(fiscal, numfis), cod);
    }
  });

  const PAGE_SIZE = 1000;
  let from = 0;
  const allFlagranciaRows: GenericRow[] = [];

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("FLAGRANCIA")
      .select("*")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Error leyendo FLAGRANCIA: ${error.message}`);
    }

    const chunk = (data || []) as GenericRow[];
    allFlagranciaRows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const filteredFlagranciaRows = allFlagranciaRows.filter((row) =>
    isFromYearOnward(getRecepcionDateFromFlagrancia(row), selectedYearNum)
  );

  const existingDelegacionesByOrden = new Map<string, GenericRow>();
  {
    const PAGE_SIZE_EXISTING = 1000;
    let existingFrom = 0;
    while (true) {
      const existingTo = existingFrom + PAGE_SIZE_EXISTING - 1;
      const { data: existingData, error: existingError } = await supabase
        .from("DELEGACIONES")
        .select("*")
        .order("ORDEN", { ascending: true })
        .range(existingFrom, existingTo);

      if (existingError) {
        throw new Error(`Error leyendo DELEGACIONES existentes: ${existingError.message}`);
      }

      const chunk = (existingData || []) as GenericRow[];
      chunk.forEach((row) => {
        const orden = toText(row["ORDEN"]);
        if (orden) {
          existingDelegacionesByOrden.set(orden, row);
        }
      });

      if (chunk.length < PAGE_SIZE_EXISTING) break;
      existingFrom += PAGE_SIZE_EXISTING;
    }
  }

  const payload = filteredFlagranciaRows.map((row, index) => {
    const mapped = mapFlagranciaToDelegaciones(row, index, articulosByDelito, fiscalCodByKey);
    const insertRow: Record<string, string> = {};
    const orden = toText(mapped["ORDEN"]);
    const existing = orden ? existingDelegacionesByOrden.get(orden) : undefined;

    DELEGACIONES_INSERT_COLUMNS.forEach((column) => {
      const mappedValue = mapped[column] || "";
      const existingValue = existing ? toText(existing[column]) : "";

      // Regla conservadora: priorizar siempre el dato ya existente para no sobrescribir carga manual.
      insertRow[column] = existingValue.trim().length > 0 ? existingValue : mappedValue;
    });
    return insertRow;
  });

  if (payload.length > 0) {
    for (let i = 0; i < payload.length; i += 500) {
      const slice = payload.slice(i, i + 500);
      const { error: insertError } = await supabase
        .from("DELEGACIONES")
        .upsert(slice, { onConflict: "ORDEN" });

      if (insertError) {
        const details = [insertError.message, insertError.details, insertError.hint].filter(Boolean).join(" | ");
        throw new Error(`No se pudo actualizar DELEGACIONES: ${details}`);
      }
    }
  }

  return { updatedCount: payload.length };
};

export default function DelegacionesFlagranciaModule() {
  const [registros, setRegistros] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingField, setSavingField] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>(String(BASE_YEAR));
  const [yearOptions, setYearOptions] = useState<string[]>([String(BASE_YEAR)]);
  const [searchNumeroDelegacion, setSearchNumeroDelegacion] = useState("");
  const [selectedOrden, setSelectedOrden] = useState("");
  const [selectedEmptyField, setSelectedEmptyField] = useState("");
  const [fieldValue, setFieldValue] = useState("");
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const selectedYearNum = Number(selectedYear);

  useEffect(() => {
    let active = true;

    const loadYearOptions = async () => {
      const years = new Set<string>();
      const PAGE_SIZE = 1000;

      const collectYears = async (table: "FLAGRANCIA" | "DELEGACIONES", column: string) => {
        let from = 0;
        while (true) {
          const to = from + PAGE_SIZE - 1;
          const { data, error } = await supabase
            .from(table)
            .select(column)
            .not(column, "is", null)
            .range(from, to);

          if (error) break;

          const chunk = (data || []) as GenericRow[];
          chunk.forEach((row) => {
            const normalized = normalizeDateValue(toText(row[column]));
            const year = normalized.split("-")[0] || "";
            if (/^\d{4}$/.test(year)) years.add(year);
          });

          if (chunk.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
      };

      await collectYears("FLAGRANCIA", "F_RECEPCION");
      await collectYears("DELEGACIONES", "FECHA_DE_RECEPCIÓN_EN_LA_PJ");

      const sorted = Array.from(years).sort((a, b) => Number(a) - Number(b));
      const fallback = String(BASE_YEAR);
      const finalYears = sorted.length > 0 ? sorted : [fallback];

      if (!active) return;
      setYearOptions(finalYears);
      setSelectedYear((prev) => (finalYears.includes(prev) ? prev : finalYears[0]));
    };

    void loadYearOptions();

    return () => {
      active = false;
    };
  }, []);

  const resumen = useMemo(
    () => ({
      total: registros.length,
      cumplidos: registros.filter((r) => (r["CUMPLIMIENTO_TOTAL"] || "").toUpperCase() === "SI").length,
    }),
    [registros]
  );

  const filteredRegistros = useMemo(() => {
    const searchKey = normalizeLookupKey(searchNumeroDelegacion);
    if (!searchKey) return registros;

    return registros.filter((row) =>
      normalizeLookupKey(row["_NÚMERO_DELEGACIÓN_FISCAL"] || "").includes(searchKey)
    );
  }, [registros, searchNumeroDelegacion]);

  const selectedRegistro = useMemo(() => {
    if (filteredRegistros.length === 0) return null;
    const ordenActivo = filteredRegistros.some((row) => row["ORDEN"] === selectedOrden)
      ? selectedOrden
      : (filteredRegistros[0]["ORDEN"] || "");
    return filteredRegistros.find((row) => row["ORDEN"] === ordenActivo) || filteredRegistros[0];
  }, [filteredRegistros, selectedOrden]);

  const emptyFields = useMemo(() => {
    if (!selectedRegistro) return [] as string[];

    return DELEGACIONES_HEADERS.filter(
      (header) => header !== "ORDEN" && String(selectedRegistro[header] || "").trim().length === 0
    );
  }, [selectedRegistro]);

  const effectiveSelectedEmptyField = useMemo(() => {
    if (EDITABLE_FIELDS.length === 0) return "";
    return EDITABLE_FIELDS.includes(selectedEmptyField as (typeof EDITABLE_FIELDS)[number])
      ? selectedEmptyField
      : EDITABLE_FIELDS[0];
  }, [selectedEmptyField]);

  const cargarDelegaciones = useCallback(async () => {
    const { data, error } = await supabase
      .from("DELEGACIONES")
      .select("*")
      .order("ORDEN", { ascending: true });

    if (error) {
      setNotification({ message: `No se pudo cargar DELEGACIONES: ${error.message}`, type: "error" });
      return;
    }

    const safeRows = ((data || []) as GenericRow[]).map((row) => {
      const normalized: Record<string, string> = {};
      DELEGACIONES_HEADERS.forEach((header) => {
        normalized[header] = toText(row[header]);
      });
      return normalized;
    }).filter((row) => isFromYearOnward(row["FECHA_DE_RECEPCIÓN_EN_LA_PJ"], selectedYearNum));

    setRegistros(safeRows);
  }, [selectedYearNum]);

  const actualizarDesdeFlagrancia = useCallback(async (silent = false) => {
    setLoading(true);

    const { data: delitosData, error: delitosError } = await supabase
      .from("delitos")
      .select("DELITO, ARTICULOS");

    if (delitosError) {
      setLoading(false);
      setNotification({ message: `Error leyendo tabla delitos: ${delitosError.message}`, type: "error" });
      return;
    }

    const articulosByDelito = new Map<string, string>();
    ((delitosData || []) as GenericRow[]).forEach((item) => {
      const key = normalizeLookupKey(item["DELITO"]);
      if (key) {
        articulosByDelito.set(key, toText(item["ARTICULOS"]));
      }
    });

    const { data: fiscalData, error: fiscalError } = await supabase
      .from("fiscal")
      .select("FISCAL, NUMFIS, COD");

    if (fiscalError) {
      setLoading(false);
      setNotification({ message: `Error leyendo tabla fiscal: ${fiscalError.message}`, type: "error" });
      return;
    }

    const fiscalCodByKey = new Map<string, string>();
    ((fiscalData || []) as GenericRow[]).forEach((item) => {
      const fiscal = toText(item["FISCAL"]);
      const numfis = extractFiscalNumber(item["NUMFIS"]);
      const cod = toText(item["COD"]).replace(/\D/g, "").slice(-4).padStart(4, "0");
      if (fiscal && numfis) {
        fiscalCodByKey.set(buildFiscalKey(fiscal, numfis), cod);
      }
    });

    const PAGE_SIZE = 1000;
    let from = 0;
    const allFlagranciaRows: GenericRow[] = [];

    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from("FLAGRANCIA")
        .select("*")
        .order("id", { ascending: true })
        .range(from, to);

      if (error) {
        setLoading(false);
        setNotification({ message: `Error leyendo FLAGRANCIA: ${error.message}`, type: "error" });
        return;
      }

      const chunk = (data || []) as GenericRow[];
      allFlagranciaRows.push(...chunk);

      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const filteredFlagranciaRows = allFlagranciaRows.filter((row) =>
      isFromYearOnward(getRecepcionDateFromFlagrancia(row), selectedYearNum)
    );

    const payload = filteredFlagranciaRows.map((row, index) => {
      const mapped = mapFlagranciaToDelegaciones(row, index, articulosByDelito, fiscalCodByKey);
      const insertRow: Record<string, string> = {};
      DELEGACIONES_INSERT_COLUMNS.forEach((column) => {
        insertRow[column] = mapped[column] || "";
      });
      return insertRow;
    });

    const { error: deleteError1 } = await supabase
      .from("DELEGACIONES")
      .delete()
      .gte("FECHA_DE_RECEPCIÓN_EN_LA_PJ", `${selectedYearNum}/01/01`);
    if (deleteError1) {
      setLoading(false);
      setNotification({ message: `No se pudo limpiar DELEGACIONES por año: ${deleteError1.message}`, type: "error" });
      return;
    }

    if (payload.length > 0) {
      for (let i = 0; i < payload.length; i += 500) {
        const slice = payload.slice(i, i + 500);
        const { error: insertError } = await supabase
          .from("DELEGACIONES")
          .upsert(slice, { onConflict: "ORDEN" });
        if (insertError) {
          const details = [insertError.message, insertError.details, insertError.hint].filter(Boolean).join(" | ");
          setLoading(false);
          setNotification({ message: `No se pudo actualizar DELEGACIONES: ${details}`, type: "error" });
          return;
        }
      }
    }

    await cargarDelegaciones();
    setLoading(false);

    if (!silent) {
      setNotification({ message: `DELEGACIONES actualizada con ${payload.length} registros desde ${selectedYearNum}/01/01`, type: "success" });
    }
  }, [cargarDelegaciones, selectedYearNum]);

  useEffect(() => {
    const timer = setTimeout(() => {
      actualizarDesdeFlagrancia(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [actualizarDesdeFlagrancia]);

  const descargarExcel = () => {
    if (registros.length === 0) {
      setNotification({ message: "No hay datos para descargar", type: "info" });
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(registros, { header: [...DELEGACIONES_HEADERS] });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DELEGACIONES");

    worksheet["!cols"] = DELEGACIONES_HEADERS.map(() => ({ wch: 19 }));

    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:A1");
    const dateColIndexes = new Set(
      DELEGACIONES_HEADERS
        .map((header, index) => ({ header, index }))
        .filter(({ header }) => /FECHA|^F_|EXTRACTO/i.test(header))
        .map(({ index }) => index)
    );

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      const cell = worksheet[addr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined;
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: "FF000000" } },
          fill: { fgColor: { rgb: "FFFFFF00" } },
          alignment: { horizontal: "center", vertical: "center", wrapText: true },
        };
      }
    }

    for (let r = 1; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = worksheet[addr] as (XLSX.CellObject & { s?: Record<string, unknown>; z?: string }) | undefined;
        if (cell) {
          const originalValue = String(cell.v ?? "");
          const isDateColumn = dateColIndexes.has(c);
          const excelSerial = isDateColumn ? isoDateToExcelSerial(originalValue) : null;

          if (excelSerial !== null) {
            cell.t = "n";
            cell.v = excelSerial;
            cell.z = "yyyy-mm-dd";
          } else {
            cell.t = "s";
            cell.v = originalValue;
            cell.z = "@";
          }

          const headerName = DELEGACIONES_HEADERS[c];
          const shouldPaintRed = RED_IF_FILLED_COLUMNS.has(headerName) && String(cell.v).trim().length > 0;
          cell.s = {
            font: { color: { rgb: shouldPaintRed ? "FFFF0000" : "FF000000" } },
            alignment: { horizontal: isDateColumn ? "center" : "left", vertical: "center" },
          };
        }
      }
    }

    XLSX.writeFile(workbook, `DELEGACIONES_FLAGRANCIA_DESDE_${selectedYearNum}.xlsx`);
  };

  const guardarCampoVacio = async () => {
    if (!selectedRegistro) {
      setNotification({ message: "No hay un registro seleccionado para editar.", type: "info" });
      return;
    }

    if (!effectiveSelectedEmptyField) {
      setNotification({ message: "Selecciona un campo vacío para rellenar.", type: "info" });
      return;
    }

    const valueToSave = fieldValue.trim();

    const orden = String(selectedRegistro["ORDEN"] || "").trim();
    if (!orden) {
      setNotification({ message: "El registro seleccionado no tiene ORDEN válido.", type: "error" });
      return;
    }

    setSavingField(true);

    const { error } = await supabase
      .from("DELEGACIONES")
      .update({ [effectiveSelectedEmptyField]: valueToSave })
      .eq("ORDEN", orden);

    if (error) {
      setSavingField(false);
      setNotification({ message: `No se pudo guardar el campo: ${error.message}`, type: "error" });
      return;
    }

    setRegistros((prev) =>
      prev.map((row) =>
        row["ORDEN"] === orden
          ? {
              ...row,
              [effectiveSelectedEmptyField]: valueToSave,
            }
          : row
      )
    );
    setSelectedEmptyField("");
    setFieldValue("");
    setSavingField(false);
    setNotification({
      message: valueToSave
        ? `Campo ${effectiveSelectedEmptyField} guardado correctamente.`
        : `Campo ${effectiveSelectedEmptyField} borrado correctamente y quedó en blanco.`,
      type: "success",
    });
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

      <div className="bg-white/5 rounded-3xl p-6 border border-white/5 space-y-4 animate-in fade-in duration-500 w-full max-w-full min-w-0 overflow-hidden h-full flex flex-col">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="text-xs text-white/60 space-y-1">
            <div>
              Total registros: <span className="font-bold text-white">{resumen.total}</span>
            </div>
            <div>
              Filtrados por IF: <span className="font-bold text-white">{filteredRegistros.length}</span>
            </div>
            <div>
              Cumplimiento total (SI): <span className="font-bold text-white">{resumen.cumplidos}</span>
            </div>
            <div>
              Mostrando desde: <span className="font-bold text-white">{selectedYearNum}/01/01</span>
            </div>
          </div>

          <div className="sticky top-0 z-30 w-full md:w-auto bg-slate-950/70 backdrop-blur-sm rounded-xl p-1 flex flex-wrap gap-2 md:justify-end">
            <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
              <label className="text-[10px] uppercase font-bold text-white/50">Año</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="bg-black border border-white/10 text-white text-xs rounded-md px-2 py-1 outline-none"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year} className="bg-black text-white">
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => actualizarDesdeFlagrancia(false)}
              disabled={loading}
              className="bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase"
            >
              {loading ? "Actualizando..." : "Actualizar"}
            </button>
            <button
              onClick={descargarExcel}
              className="bg-green-600 hover:bg-green-500 px-6 py-2.5 rounded-xl font-black text-[10px] uppercase shadow-lg transition-all active:scale-95"
            >
              Descargar Excel
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-4 space-y-3">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(14rem,18rem)_minmax(12rem,16rem)_minmax(18rem,1fr)_minmax(18rem,1fr)_auto] gap-3 items-end">
            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">
                Buscar por _NÚMERO_DELEGACIÓN_FISCAL
              </label>
              <input
                type="text"
                value={searchNumeroDelegacion}
                onChange={(e) => {
                  setSearchNumeroDelegacion(e.target.value);
                  setSelectedOrden("");
                  setSelectedEmptyField("");
                  setFieldValue("");
                }}
                placeholder="Escribe el IF..."
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">
                Registro
              </label>
              <select
                value={selectedRegistro?.["ORDEN"] || ""}
                onChange={(e) => {
                  setSelectedOrden(e.target.value);
                  setSelectedEmptyField("");
                  setFieldValue("");
                }}
                disabled={filteredRegistros.length === 0}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {filteredRegistros.length === 0 ? (
                  <option value="" className="bg-black text-white">Sin coincidencias</option>
                ) : (
                  filteredRegistros.map((row) => {
                    const orden = row["ORDEN"] || "";
                    const numero = row["_NÚMERO_DELEGACIÓN_FISCAL"] || "SIN IF";
                    return (
                      <option key={`registro-${orden}`} value={orden} className="bg-black text-white">
                        {numero} | ORDEN {orden}
                      </option>
                    );
                  })
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">
                Campos
              </label>
              <select
                value={effectiveSelectedEmptyField}
                onChange={(e) => {
                  setSelectedEmptyField(e.target.value);
                  setFieldValue("");
                }}
                disabled={!selectedRegistro || EDITABLE_FIELDS.length === 0}
                className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {!selectedRegistro ? (
                  <option value="" className="bg-black text-white">Busca un IF para elegir el registro</option>
                ) : (
                  EDITABLE_FIELDS.map((field) => (
                    <option key={field} value={field} className="bg-black text-white">
                      {field}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] uppercase font-bold tracking-[0.2em] text-cyan-200/80">
                Nuevo valor
              </label>
              <input
                type="text"
                value={fieldValue}
                onChange={(e) => setFieldValue(e.target.value)}
                disabled={!selectedRegistro || EDITABLE_FIELDS.length === 0}
                placeholder={effectiveSelectedEmptyField ? `Escribe ${effectiveSelectedEmptyField}` : "Selecciona un campo vacío"}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300/60 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <button
              onClick={guardarCampoVacio}
              disabled={savingField || !selectedRegistro || EDITABLE_FIELDS.length === 0}
              className="rounded-xl bg-cyan-500 px-5 py-2.5 text-[11px] font-black uppercase text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingField ? "Guardando..." : "Guardar campo"}
            </button>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-white/60">
            <div>
              IF seleccionado: <span className="font-bold text-white">{selectedRegistro?.["_NÚMERO_DELEGACIÓN_FISCAL"] || "-"}</span>
            </div>
            <div>
              ORDEN: <span className="font-bold text-white">{selectedRegistro?.["ORDEN"] || "-"}</span>
            </div>
            <div>
              Campos vacíos detectados: <span className="font-bold text-white">{emptyFields.length}</span>
            </div>
            <div>
              Campos editables disponibles: <span className="font-bold text-white">{EDITABLE_FIELDS.length}</span>
            </div>
            <div>
              Para borrar un dato, deja Nuevo valor vacío y presiona <span className="font-bold text-white">Guardar campo</span>.
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/5 bg-black/20 w-full max-w-full min-w-0 overflow-hidden flex-1 min-h-0">
          <div className="relative h-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/30 to-transparent z-20" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/30 to-transparent z-20" />
            <div className="block h-full w-full max-w-full overflow-y-auto overflow-x-scroll overscroll-x-contain custom-scrollbar" style={{ scrollbarGutter: "stable both-edges" }}>
              <table className="table-fixed min-w-max w-max text-[10px] text-left border-collapse">
              <thead className="sticky top-0 bg-neutral-900 text-white/30 uppercase font-black z-10">
                <tr>
                  {DELEGACIONES_HEADERS.map((header) => (
                    <th key={header} className="p-3 whitespace-nowrap min-w-[7rem] max-w-[7rem] overflow-hidden text-ellipsis">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-white/70">
                {filteredRegistros.map((row, idx) => (
                  <tr key={`row-${idx}-${row["ORDEN"] || ""}`} className="border-t border-white/5 hover:bg-white/5">
                    {DELEGACIONES_HEADERS.map((header) => (
                      <td key={`${header}-${idx}`} className={`p-3 whitespace-nowrap min-w-[7rem] max-w-[7rem] overflow-hidden text-ellipsis font-mono ${RED_IF_FILLED_COLUMNS.has(header) && String(row[header] || "").trim().length > 0 ? "text-red-300" : ""}`}>
                        {row[header] || ""}
                      </td>
                    ))}
                  </tr>
                ))}
                {filteredRegistros.length === 0 && !loading && (
                  <tr>
                    <td colSpan={DELEGACIONES_HEADERS.length} className="p-6 text-center text-white/40">
                      No hay coincidencias para ese _NÚMERO_DELEGACIÓN_FISCAL.
                    </td>
                  </tr>
                )}
              </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
