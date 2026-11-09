import { supabase } from "@/lib/supabaseClient";

export type PartesSourceTable = "PARTES" | "partes_viejas";

export type ParteLikeRow = {
  id?: string | number | null;
  expediente?: string | null;
  fecha_apertura?: string | null;
  fecha_cierre?: string | null;
  descripcion?: string | null;
  created_at?: string | null;
  [key: string]: unknown;
};

/**
 * Normaliza cualquier formato de fecha a 'YYYY-MM-DD'
 */
export const normalizeDateValue = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const firstChunk = raw.split(" ")[0].split("T")[0];
  const normalized = firstChunk.replace(/\//g, "-");
  const matchIso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (matchIso) {
    return `${matchIso[1]}-${matchIso[2].padStart(2, "0")}-${matchIso[3].padStart(2, "0")}`;
  }
  const matchDmy = normalized.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (matchDmy) {
    return `${matchDmy[3]}-${matchDmy[2].padStart(2, "0")}-${matchDmy[1].padStart(2, "0")}`;
  }
  return "";
};

/**
 * Extrae el código PP de la descripción (ej: 'PP-2021013000315014910')
 * Permite ordenar por la marca de tiempo exacta del parte cuando coinciden fecha de cierre y apertura.
 */
export const extractCodigoPP = (text: string): string => {
  const match = String(text || "").match(/PP-(\d{8,14})/i);
  return match ? match[1] : "";
};

/**
 * Ordenamiento canónico estricto para partes:
 * 1. fecha_cierre ASC (criterio principal y obligatorio)
 * 2. fecha_apertura ASC (criterio secundario para desempatar)
 * 3. Código PP extraído de la descripción (hora y minuto del parte, ej. 00:31 antes de 05:01)
 * 4. Secuencia numérica actual de expediente (0023 antes de 0024)
 * 5. created_at ASC
 * 6. id numérico ASC
 */
export const sortPartesCanonical = <T extends ParteLikeRow>(a: T, b: T): number => {
  // 1. fecha_cierre ASC
  const fcA = normalizeDateValue(a.fecha_cierre);
  const fcB = normalizeDateValue(b.fecha_cierre);
  if (fcA !== fcB) return fcA.localeCompare(fcB);

  // 2. fecha_apertura ASC
  const faA = normalizeDateValue(a.fecha_apertura);
  const faB = normalizeDateValue(b.fecha_apertura);
  if (faA !== faB) return faA.localeCompare(faB);

  // 3. Código PP de la descripción
  const ppA = extractCodigoPP(String(a.descripcion || ""));
  const ppB = extractCodigoPP(String(b.descripcion || ""));
  if (ppA && ppB && ppA !== ppB) {
    return ppA.localeCompare(ppB);
  }

  // 4. Secuencia numérica del expediente existente
  const seqA = getSequenceFromExpediente(String(a.expediente || ""));
  const seqB = getSequenceFromExpediente(String(b.expediente || ""));
  if (seqA > 0 && seqB > 0 && seqA !== seqB) {
    return seqA - seqB;
  }

  // 5. created_at ASC
  const crA = String(a.created_at || "").trim();
  const crB = String(b.created_at || "").trim();
  if (crA && crB && crA !== crB) {
    return crA.localeCompare(crB);
  }

  // 6. id numérico ASC
  const idA = Number(a.id);
  const idB = Number(b.id);
  if (Number.isFinite(idA) && Number.isFinite(idB) && idA !== idB) {
    return idA - idB;
  }

  return String(a.id || "").localeCompare(String(b.id || ""));
};

/**
 * Extrae el número secuencial de un expediente con formato "0001-2026"
 */
export const getSequenceFromExpediente = (expediente: string, targetYear?: string): number => {
  const clean = String(expediente || "").trim();
  const match = clean.match(/^(\d+)-(\d{4})$/);
  if (!match) return 0;
  if (targetYear && match[2] !== targetYear) return 0;
  const num = Number(match[1]);
  return Number.isFinite(num) ? num : 0;
};

/**
 * Formatea un número secuencial y año a formato "0001-YYYY"
 */
export const formatExpediente = (sequence: number, year: string): string => {
  const safeYear = year.replace(/\D/g, "").slice(0, 4) || String(new Date().getFullYear());
  const safeSeq = Math.max(1, Math.floor(sequence || 1));
  return `${String(safeSeq).padStart(4, "0")}-${safeYear}`;
};

/**
 * Consulta la base de datos para obtener el número correlativo siguiente para un año dado.
 */
export const obtenerSiguienteExpedientePorAnio = async (
  sourceTable: PartesSourceTable,
  anioSeleccionado: string
): Promise<number> => {
  const cleanYear = anioSeleccionado.replace(/\D/g, "").slice(0, 4);
  if (cleanYear.length !== 4) return 1;

  try {
    const { data, error } = await supabase
      .from(sourceTable)
      .select("expediente")
      .like("expediente", `%-${cleanYear}`)
      .limit(5000);

    if (error || !data) return 1;

    const maxSequence = data.reduce((acc, row) => {
      const val = String(row.expediente || "");
      const seq = getSequenceFromExpediente(val, cleanYear);
      return seq > acc ? seq : acc;
    }, 0);

    return maxSequence + 1;
  } catch (err) {
    console.error("Error al obtener siguiente expediente:", err);
    return 1;
  }
};

/**
 * Resultado del proceso de reordenamiento/acomodo de secuencia.
 */
export type ResequenceResult = {
  success: boolean;
  total: number;
  updatedCount: number;
  nextSequence: number;
  error?: string;
};

/**
 * Reordena y renumera correlativamente (0001-YYYY, 0002-YYYY...) TODOS los expedientes
 * de un año específico en la tabla indicada, RIGUROSAMENTE ordenados por FECHA DE CIERRE.
 * 
 * Regla de orden:
 * 1. fecha_cierre ASC (criterio principal)
 * 2. fecha_apertura ASC (criterio secundario para desempatar)
 * 3. Código PP extraído de la descripción (hora cronológica exacta)
 * 4. Secuencia numérica previa
 * 5. created_at ASC / id ASC
 * 
 * Utiliza un proceso en 2 etapas por lotes concurrentes para evitar colisiones de clave única
 * y asegurar un rendimiento óptimo sin timeouts.
 */
export const acomodarSecuenciaPorFechaCierre = async (
  sourceTable: PartesSourceTable,
  anio: string
): Promise<ResequenceResult> => {
  const safeYear = anio.replace(/\D/g, "").slice(0, 4);
  if (safeYear.length !== 4) {
    return { success: false, total: 0, updatedCount: 0, nextSequence: 1, error: "Año inválido" };
  }

  try {
    // 1. Obtener todos los registros del año paginados de forma exhaustiva
    const PAGE_SIZE = 1000;
    let from = 0;
    const allFetched: ParteLikeRow[] = [];

    while (true) {
      const { data, error } = await supabase
        .from(sourceTable)
        .select("id, expediente, fecha_apertura, fecha_cierre, created_at, descripcion")
        .or(`expediente.ilike.%-${safeYear},and(fecha_cierre.gte.${safeYear}-01-01,fecha_cierre.lte.${safeYear}-12-31)`)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Error consultando registros para resecuencia:", error);
        return { success: false, total: 0, updatedCount: 0, nextSequence: 1, error: error.message };
      }

      const chunk = (data || []) as ParteLikeRow[];
      allFetched.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (allFetched.length === 0) {
      return { success: true, total: 0, updatedCount: 0, nextSequence: 1 };
    }

    // Filtrar estrictamente los que pertenecen al año según fecha_cierre o expediente
    const yearRows = allFetched.filter((row) => {
      const exp = String(row.expediente || "").trim();
      const fc = normalizeDateValue(row.fecha_cierre);
      return exp.endsWith(`-${safeYear}`) || fc.startsWith(safeYear);
    });

    if (yearRows.length === 0) {
      return { success: true, total: 0, updatedCount: 0, nextSequence: 1 };
    }

    // 2. ORDENAMIENTO CANÓNICO RIGUROSO POR FECHA DE CIERRE Y FECHA DE APERTURA
    yearRows.sort(sortPartesCanonical);

    // 3. Detectar diferencias entre el expediente actual y el correlativo correspondiente
    const updatesToRun: Array<{ id: string | number; oldExpediente: string; nuevoExpediente: string }> = [];

    yearRows.forEach((row, idx) => {
      const seq = idx + 1;
      const nuevoExpediente = formatExpediente(seq, safeYear);
      const actualExpediente = String(row.expediente || "").trim();

      if (actualExpediente !== nuevoExpediente) {
        updatesToRun.push({
          id: row.id as string | number,
          oldExpediente: actualExpediente,
          nuevoExpediente,
        });
      }
    });

    if (updatesToRun.length === 0) {
      return {
        success: true,
        total: yearRows.length,
        updatedCount: 0,
        nextSequence: yearRows.length + 1,
      };
    }

    const BATCH_SIZE = 25;

    // 4. Etapa 1: Asignar valores temporales por lotes concurrentes para evitar colisión de claves únicas
    for (let i = 0; i < updatesToRun.length; i += BATCH_SIZE) {
      const chunk = updatesToRun.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map(async (item) => {
          const tempExp = `TMP-${String(item.id).replace(/\D/g, "").slice(0, 8) || Math.random().toString(36).slice(2, 8)}-${safeYear}`;
          const { error: tmpErr } = await supabase
            .from(sourceTable)
            .update({ expediente: tempExp })
            .eq("id", item.id);

          if (tmpErr) {
            console.warn("Advertencia en paso temporal:", tmpErr.message);
          }
        })
      );
    }

    // 5. Etapa 2: Asignar el nuevo expediente secuencial final
    let successCount = 0;
    for (let i = 0; i < updatesToRun.length; i += BATCH_SIZE) {
      const chunk = updatesToRun.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        chunk.map(async (item) => {
          const { error: updErr } = await supabase
            .from(sourceTable)
            .update({ expediente: item.nuevoExpediente })
            .eq("id", item.id);

          if (updErr) {
            console.error("Error aplicando expediente secuencial:", updErr);
            return false;
          }
          return true;
        })
      );
      successCount += results.filter(Boolean).length;
    }

    return {
      success: true,
      total: yearRows.length,
      updatedCount: successCount,
      nextSequence: yearRows.length + 1,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado al acomodar secuencia";
    console.error("Error en acomodarSecuenciaPorFechaCierre:", err);
    return { success: false, total: 0, updatedCount: 0, nextSequence: 1, error: msg };
  }
};

