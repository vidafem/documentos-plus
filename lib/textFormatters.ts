/**
 * Utilidades para formateo de texto seguro con soporte Unicode (acentos, letra Ñ).
 * Evita el problema clásico de JavaScript donde \b\w transforma "Nuñez" en "NuñEz"
 * o "García" en "GarcíA".
 */

/**
 * Convierte un texto a Formato Nombre Propio (Title Case) para cada palabra,
 * respetando caracteres especiales en español (ñ, acentos, diéresis).
 */
export const toTitleCaseWords = (str: string): string => {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/(?:^|[^\p{L}\p{N}])(\p{L})/gu, (match, letter) =>
      match.replace(letter, letter.toUpperCase())
    );
};

/**
 * Convierte un texto a Formato Tipo Oración (Sentence Case):
 * Solo la primera letra de toda la oración es mayúscula, el resto minúsculas.
 * Ideal para tipificación de delitos.
 * Ejemplo: "ARMAS DE FUEGO, MUNICIONES Y EXPLOSIVOS NO AUTORIZADOS"
 *       -> "Armas de fuego, municiones y explosivos no autorizados"
 */
export const toSentenceCase = (str: string): string => {
  const trimmed = String(str || "").trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/**
 * Determina la etiqueta correcta según la cantidad de personas:
 * - 1 persona -> "Detenido"
 * - 2 o más personas (separadas por coma o más de 4 palabras) -> "Detenidos"
 */
export const getEtiquetaDetenidos = (detenidosStr: string): "Detenido" | "Detenidos" => {
  const limpio = String(detenidosStr || "").trim();
  if (!limpio) return "Detenido";
  const personas = limpio.split(",").map((p) => p.trim()).filter(Boolean);
  if (personas.length > 1) return "Detenidos";
  const palabras = limpio.split(/\s+/).filter(Boolean);
  if (palabras.length > 4) return "Detenidos";
  return "Detenido";
};

/**
 * Limpia y formatea la lista de personas detenidas / sospechosas:
 * Espaciado correcto entre comas y cada nombre en Nombre Propio.
 * Ejemplo: "SARANGO LOPEZ ROSA ELENA, CORONEL MONTAÑO YAJAIRA FERNANDA"
 *       -> "Sarango Lopez Rosa Elena, Coronel Montaño Yajaira Fernanda"
 */
export const formatDetenidosList = (detenidosStr: string): string => {
  const cleaned = String(detenidosStr || "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  return toTitleCaseWords(cleaned);
};

/**
 * Construye la descripción completa para Partes con el formato estándar nuevo:
 * PP-XXXXXXXXXXXX; Detenido(s): Nombres Apellidos; Delito: Descripción en tipo oración
 */
export const formatDescripcionParteCompleta = (
  codigoPP: string,
  detenidos: string,
  delito: string
): string => {
  const pp = String(codigoPP || "").trim().toUpperCase();
  const detList = formatDetenidosList(detenidos);
  const etiqueta = getEtiquetaDetenidos(detList);
  const delitoFormateado = toSentenceCase(delito);

  const partes: string[] = [];
  if (pp) partes.push(pp);
  if (detList) partes.push(`${etiqueta}: ${detList}`);
  if (delitoFormateado) partes.push(`Delito: ${delitoFormateado}`);

  return partes.join("; ");
};

/**
 * Convierte cualquier texto de descripción existente (sea viejo en mayúsculas completas,
 * o con variaciones) al nuevo formato estándar requerido.
 * Si ya cumple con el formato, lo preserva de forma idéntica e idempotente.
 */
export const normalizeDescripcionParteExistente = (descripcion: string): string => {
  const raw = String(descripcion || "").trim();
  if (!raw) return "";

  // Extraer código PP (conservando prefijo PP en mayúscula)
  const ppMatch = raw.match(/\b(PP-[A-Za-z0-9]+)\b/i);
  const ppCode = ppMatch ? ppMatch[1].toUpperCase() : "";

  // Extraer bloque de detenidos / sospechosos
  const detMatch = raw.match(/(?:DETENIDO|DETENIDOS|SOSPECHOSO|SOSPECHOSOS)(?:\(S\))?:\s*([^;]+)(?:;|$)/i);
  const detenidosRaw = detMatch ? detMatch[1].trim() : "";

  // Extraer bloque de delito
  const delitoMatch = raw.match(/DELITO:\s*(.+)$/i);
  const delitoRaw = delitoMatch ? delitoMatch[1].trim() : "";

  if (ppCode && (detenidosRaw || delitoRaw)) {
    return formatDescripcionParteCompleta(ppCode, detenidosRaw, delitoRaw);
  }

  // Fallback si no tiene PP pero sí tiene Detenido/Delito
  if (detenidosRaw || delitoRaw) {
    const etiqueta = getEtiquetaDetenidos(detenidosRaw);
    const partes: string[] = [];
    if (detenidosRaw) partes.push(`${etiqueta}: ${formatDetenidosList(detenidosRaw)}`);
    if (delitoRaw) partes.push(`Delito: ${toSentenceCase(delitoRaw)}`);
    return partes.join("; ");
  }

  return raw;
};

export type ModalidadParte =
  | "default"
  | "ingreso_automotor"
  | "ingreso_motocicleta"
  | "robo_vehiculo"
  | "robo_motocicleta"
  | "robo_domicilio"
  | "robo_comercial"
  | "robo_personas"
  | "operativo_policial"
  | "ingreso_caie"
  | "personalizado";

export interface ModalidadParams {
  detenidos?: string;
  delito?: string;
  placa?: string;
  sinPlaca?: boolean;
  direccion?: string;
  nombreLocal?: string;
  comprobanteCaie?: string;
  textoPersonalizado?: string;
}

export const OPCIONES_MODALIDAD: { id: ModalidadParte; label: string; icon: string }[] = [
  { id: "default", label: "Por defecto (Detenido y Delito)", icon: "👤" },
  { id: "ingreso_automotor", label: "Ingreso de automotor a Patios", icon: "🚗" },
  { id: "ingreso_motocicleta", label: "Ingreso de motocicleta a Patios", icon: "🏍️" },
  { id: "robo_vehiculo", label: "Robo de vehículo", icon: "🚨" },
  { id: "robo_motocicleta", label: "Robo de motocicleta", icon: "🛵" },
  { id: "robo_domicilio", label: "Robo a domicilio / vivienda", icon: "🏠" },
  { id: "robo_comercial", label: "Robo a local comercial", icon: "🏪" },
  { id: "robo_personas", label: "Robo a personas", icon: "🚶" },
  { id: "operativo_policial", label: "Resultado de operativo policial", icon: "🛡️" },
  { id: "ingreso_caie", label: "Ingreso de indicios al CAIE", icon: "📦" },
  { id: "personalizado", label: "Texto libre / Personalizado", icon: "✍️" },
];

export interface ParsedCodigoParte {
  anio: string;
  mes: string;
  dia: string;
  secuencia: string;
}

export const parseCodigoParteCompleto = (rawText: string): ParsedCodigoParte | null => {
  const text = String(rawText || "").trim();
  const match = text.match(/(?:Parte\s+Policial\s+N[roº\.]*\s*|PP-)?\b(\d{4})(\d{2})(\d{2})(\d{8,14})\b/i);
  if (!match) return null;
  const [, anio, mes, dia, secuencia] = match;
  const mNum = Number(mes);
  const dNum = Number(dia);
  if (mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) return null;
  return { anio, mes, dia, secuencia };
};

export const generarDescripcionParte = (
  codigoPPFull: string,
  mod: ModalidadParte,
  params: ModalidadParams
): string => {
  const pp = String(codigoPPFull || "").trim().toUpperCase();

  if (mod === "default") {
    return formatDescripcionParteCompleta(pp, params.detenidos || "", params.delito || "");
  }

  let cuerpo = "";
  const placaLimpia = (params.placa || "").trim().toUpperCase().replace(/\s+/g, "");
  const dirLimpia = (params.direccion || "").trim();

  switch (mod) {
    case "ingreso_automotor": {
      if (params.sinPlaca) {
        cuerpo = "Ingreso de automotor sin placas a los Patios de Retención Vehicular.";
      } else {
        const placaStr = placaLimpia ? ` de placas ${placaLimpia}` : "";
        cuerpo = `Ingreso de automotor${placaStr} a los Patios de Retención Vehicular.`;
      }
      break;
    }
    case "ingreso_motocicleta": {
      if (params.sinPlaca) {
        cuerpo = "Ingreso de motocicleta sin placas a los Patios de Retención Vehicular.";
      } else {
        const placaStr = placaLimpia ? ` de placas ${placaLimpia}` : "";
        cuerpo = `Ingreso de motocicleta${placaStr} a los Patios de Retención Vehicular.`;
      }
      break;
    }
    case "robo_vehiculo": {
      const placaStr = placaLimpia ? ` de placas ${placaLimpia}` : "";
      const dirStr = dirLimpia ? `, ${dirLimpia}` : "";
      cuerpo = `Robo de vehículo${placaStr}${dirStr}.`;
      break;
    }
    case "robo_motocicleta": {
      const placaStr = placaLimpia ? ` de placas ${placaLimpia}` : "";
      const dirStr = dirLimpia ? `, ${dirLimpia}` : "";
      cuerpo = `Robo de motocicleta${placaStr}${dirStr}.`;
      break;
    }
    case "robo_domicilio": {
      const dirStr = dirLimpia ? `, ${dirLimpia}` : "";
      cuerpo = `Robo en una vivienda${dirStr}.`;
      break;
    }
    case "robo_comercial": {
      const localStr = (params.nombreLocal || "").trim() ? ` "${(params.nombreLocal || "").trim().toUpperCase()}"` : "";
      const dirStr = dirLimpia ? `, ${dirLimpia}` : "";
      cuerpo = `Robo a local comercial${localStr}${dirStr}.`;
      break;
    }
    case "robo_personas": {
      const dirStr = dirLimpia ? `, ${dirLimpia}` : "";
      cuerpo = `Robo a personas${dirStr}.`;
      break;
    }
    case "operativo_policial": {
      const dirStr = dirLimpia ? `, ${dirLimpia}` : "";
      cuerpo = `Dando a conocer resultado de operativo policial${dirStr}.`;
      break;
    }
    case "ingreso_caie": {
      const compStr = (params.comprobanteCaie || "").trim() ? ` mediante Comprobante Nro. ${(params.comprobanteCaie || "").trim()}` : "";
      cuerpo = `Ingreso de indicios${compStr} al CAIE.`;
      break;
    }
    case "personalizado": {
      cuerpo = (params.textoPersonalizado || "").trim();
      if (cuerpo && !cuerpo.endsWith(".")) cuerpo += ".";
      break;
    }
  }

  return cuerpo ? (pp ? `${pp}; ${cuerpo}` : cuerpo) : pp;
};

