import { supabase } from "@/lib/supabaseClient";

export type LogBusquedaItem = {
  id?: string;
  created_at?: string;
  modulo: string;
  numero: string;
  criterio?: string;
  detenidos?: string;
  delito?: string;
  estado: "exitosa" | "normal";
  total_encontrados?: number;
  usuario?: string;
};

/**
 * Registra una búsqueda en la tabla `historial_busquedas` de Supabase.
 * No interrumpe el flujo de la aplicación si la tabla aún no existe o si ocurre un error de red.
 */
export async function registrarLogBusqueda(params: LogBusquedaItem): Promise<void> {
  try {
    const payload = {
      modulo: params.modulo || "General",
      numero: params.numero || "S/N",
      criterio: params.criterio || "General",
      detenidos: params.detenidos || "",
      delito: params.delito || "",
      estado: params.estado || "normal",
      total_encontrados: params.total_encontrados || 0,
      usuario: params.usuario || "",
    };

    const { error } = await supabase.from("historial_busquedas").insert([payload]);
    if (error) {
      console.warn("Aviso al registrar log de búsqueda:", error.message);
    }
  } catch (err) {
    console.warn("Excepción al registrar log de búsqueda:", err);
  }
}

/**
 * Consulta el historial de búsquedas desde Supabase con límite configurable.
 */
export async function obtenerHistorialBusquedas(limit = 1000): Promise<{ data: LogBusquedaItem[]; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from("historial_busquedas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { data: [], error: error.message };
    }

    return { data: (data || []) as LogBusquedaItem[], error: null };
  } catch (err) {
    return { data: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Elimina todos los registros de la tabla `historial_busquedas`.
 */
export async function eliminarTodoHistorialBusquedas(): Promise<{ ok: boolean; error: string | null }> {
  try {
    // En Supabase/PostgREST delete sin filtros requiere un filtro que abarque todo, como id not null o created_at not null
    const { error } = await supabase
      .from("historial_busquedas")
      .delete()
      .not("id", "is", null);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Elimina un registro individual por su ID.
 */
export async function eliminarLogIndividual(id: string): Promise<{ ok: boolean; error: string | null }> {
  try {
    const { error } = await supabase
      .from("historial_busquedas")
      .delete()
      .eq("id", id);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
