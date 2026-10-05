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
