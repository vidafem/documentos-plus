function isLocalHostOrNetwork(): boolean {
  if (typeof window === "undefined") return true;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  );
}

export async function consultarFiscaliaConFallback(queryString: string) {
  const isLocal = isLocalHostOrNetwork();

  // 1. Intentar llamar al endpoint de la app actual (/api/consulta-fiscalia)
  try {
    const res = await fetch(`/api/consulta-fiscalia?${queryString}`);
    if (res.ok) {
      const json = await res.json();

      // Si tuvo éxito (encontró registros o no hay registros para esa cédula)
      if (json.success) {
        return json;
      }

      // Si la llamada en la nube devolvió 403 (bloqueo WAF de Imperva a los datacenters de Vercel/AWS)
      const isCloudBlocked =
        !json.success &&
        Boolean(json.error && (json.error.includes("403") || json.error.includes("Fiscalía") || json.error.includes("WAF")));

      if (isCloudBlocked && !isLocal) {
        // Verificar si se configuró un túnel o puente público en las variables de entorno
        const bridgeUrl = process.env.NEXT_PUBLIC_FISCALIA_BRIDGE_URL;
        if (bridgeUrl) {
          try {
            const bridgeRes = await fetch(`${bridgeUrl.replace(/\/$/, "")}/api/consulta-fiscalia?${queryString}`);
            if (bridgeRes.ok) {
              const bridgeJson = await bridgeRes.json();
              if (bridgeJson.success) return bridgeJson;
            }
          } catch {
            // El puente no respondió
          }
        }

        return {
          success: false,
          found: false,
          error: json.error,
          message:
            "El cortafuegos de la Fiscalía (Imperva WAF) bloquea las peticiones desde los servidores en la nube de Vercel (error 403).",
        };
      }

      return json;
    } else {
      return {
        success: false,
        found: false,
        error: `Error HTTP ${res.status}`,
        message: `El servidor respondió con código ${res.status}.`,
      };
    }
  } catch (err: unknown) {
    const isFailedFetch =
      err instanceof TypeError &&
      (err.message.includes("Failed to fetch") || err.message.includes("NetworkError"));

    return {
      success: false,
      found: false,
      error: "Error de conexión con la API.",
      message: isFailedFetch
        ? "No se pudo establecer conexión con el servidor. Verifica tu conexión a internet."
        : "Error de conexión al consultar el servidor de Fiscalía.",
    };
  }
}


