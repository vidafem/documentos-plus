import { supabase } from "@/lib/supabaseClient";

export type PartesSourceTable = "PARTES" | "partes_viejas";

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
 * de un año específico en la tabla indicada, RIGURÓSAMENTE ordenados por FECHA DE CIERRE.
 * 
 * Regla de orden:
 * 1. fecha_cierre ASC (criterio principal)
 * 2. fecha_apertura ASC (criterio secundario para desempatar)
 * 3. created_at ASC / id ASC (para desempatar idénticos)
 * 
 * Utiliza un proceso en 2 etapas para evitar colisiones de clave única / valores duplicados en tránsito.
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
    // 1. Obtener todos los registros del año por expediente o por fecha de cierre
    const { data, error } = await supabase
      .from(sourceTable)
      .select("id, expediente, fecha_apertura, fecha_cierre, created_at")
      .or(`expediente.ilike.%-${safeYear},fecha_cierre.gte.${safeYear}-01-01,fecha_cierre.lte.${safeYear}-12-31`)
      .limit(5000);

    if (error) {
      console.error("Error consultando registros para resecuencia:", error);
      return { success: false, total: 0, updatedCount: 0, nextSequence: 1, error: error.message };
    }

    if (!data || data.length === 0) {
      return { success: true, total: 0, updatedCount: 0, nextSequence: 1 };
    }

    // Filtrar estrictamente los que pertenecen al año según fecha_cierre o expediente
    const yearRows = data.filter((row) => {
      const exp = String(row.expediente || "").trim();
      const fc = String(row.fecha_cierre || "").trim();
      return exp.endsWith(`-${safeYear}`) || fc.startsWith(safeYear);
    });

    if (yearRows.length === 0) {
      return { success: true, total: 0, updatedCount: 0, nextSequence: 1 };
    }

    // 2. ORDENAMIENTO RIGUROSO POR FECHA DE CIERRE
    yearRows.sort((a, b) => {
      const fcA = String(a.fecha_cierre || "").trim();
      const fcB = String(b.fecha_cierre || "").trim();
      if (fcA !== fcB) return fcA.localeCompare(fcB);

      const faA = String(a.fecha_apertura || "").trim();
      const faB = String(b.fecha_apertura || "").trim();
      if (faA !== faB) return faA.localeCompare(faB);

      const crA = String(a.created_at || "").trim();
      const crB = String(b.created_at || "").trim();
      if (crA !== crB) return crA.localeCompare(crB);

      return String(a.id).localeCompare(String(b.id));
    });

    // 3. Detectar diferencias entre el expediente actual y el correlativo correspondiente
    const updatesToRun: Array<{ id: string | number; oldExpediente: string; nuevoExpediente: string }> = [];

    yearRows.forEach((row, idx) => {
      const seq = idx + 1;
      const nuevoExpediente = formatExpediente(seq, safeYear);
      const actualExpediente = String(row.expediente || "").trim();

      if (actualExpediente !== nuevoExpediente) {
        updatesToRun.push({
          id: row.id,
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

    // 4. Etapa 1: Asignar valores temporales para evitar colisión de claves únicas
    for (const item of updatesToRun) {
      const tempExp = `TMP-${String(item.id).replace(/\D/g, "").slice(0, 8) || Math.random().toString(36).slice(2, 8)}-${safeYear}`;
      const { error: tmpErr } = await supabase
        .from(sourceTable)
        .update({ expediente: tempExp })
        .eq("id", item.id);

      if (tmpErr) {
        console.warn("Advertencia en paso temporal:", tmpErr.message);
      }
    }

    // 5. Etapa 2: Asignar el nuevo expediente final secuencial
    let successCount = 0;
    for (const item of updatesToRun) {
      const { error: updErr } = await supabase
        .from(sourceTable)
        .update({ expediente: item.nuevoExpediente })
        .eq("id", item.id);

      if (updErr) {
        console.error("Error aplicando expediente secuencial:", updErr);
      } else {
        successCount++;
      }
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
