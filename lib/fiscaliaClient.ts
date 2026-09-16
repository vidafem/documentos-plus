export async function consultarFiscaliaConFallback(queryString: string) {
  // 1. Intentar llamar al endpoint de la app actual (/api/consulta-fiscalia)
  try {
    const res = await fetch(`/api/consulta-fiscalia?${queryString}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.found) {
        return json;
      }
      // Si la llamada en la nube devolvió 403 (bloqueo WAF de datacenter en Vercel)
      if (!json.success && json.error && (json.error.includes("403") || json.error.includes("Fiscalía"))) {
        if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
          try {
            const localRes = await fetch(`http://localhost:3000/api/consulta-fiscalia?${queryString}`);
            if (localRes.ok) {
              const localJson = await localRes.json();
              if (localJson.success && localJson.found) {
                return localJson;
              }
            }
          } catch {
            // Servidor local no disponible
          }
        }
      }
      return json;
    }
  } catch {
    // Si la llamada falló por completo en la nube, probar local
    if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
      try {
        const localRes = await fetch(`http://localhost:3000/api/consulta-fiscalia?${queryString}`);
        if (localRes.ok) {
          return await localRes.json();
        }
      } catch {
        // Servidor local no disponible
      }
    }
  }

  return { success: false, found: false };
}
