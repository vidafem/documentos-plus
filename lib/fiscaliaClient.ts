export function isLocalHostOrNetwork(): boolean {
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

export function isExtensionInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.dataset.fiscaliaExtension === "true" ||
    document.documentElement.getAttribute("data-fiscalia-extension") === "true" ||
    Boolean((window as unknown as Record<string, unknown>).__FISCALIA_EXTENSION_INSTALLED__)
  );
}

interface SujetoResponse {
  cedula?: string;
  persona?: string;
  tipo?: string;
}

interface CabeceraItem {
  ndd?: string;
  ndd1?: string;
  fecha?: string;
  hora?: string;
  numeroinf?: string;
  gen_delito_tipopenal?: string;
  sujetos?: SujetoResponse[];
}

interface ExtensionRawResponse {
  success?: boolean;
  status?: number;
  data?: {
    cabecera?: CabeceraItem[];
    error?: string;
  };
  error?: string;
}

export async function consultarViaExtension(criterio: string, valor: string): Promise<Record<string, unknown> | null> {
  if (typeof window === "undefined") return null;

  return new Promise((resolve) => {
    const id = "req_" + Math.random().toString(36).substring(2, 10);
    const timer = setTimeout(() => {
      window.removeEventListener("FISCALIA_EXTENSION_RESPONSE_" + id, handleResponse);
      resolve(null);
    }, 8000);

    const handleResponse = (event: Event) => {
      clearTimeout(timer);
      window.removeEventListener("FISCALIA_EXTENSION_RESPONSE_" + id, handleResponse);
      const customEvent = event as CustomEvent<ExtensionRawResponse>;
      const detail = customEvent.detail;

      if (!detail || !detail.success || !detail.data) {
        resolve(null);
        return;
      }

      const siafData = detail.data;
      if (!siafData.cabecera || siafData.cabecera.length === 0) {
        resolve({
          success: true,
          found: false,
          source: "extension",
          message: "No se encontraron registros para este código en Fiscalía.",
        });
        return;
      }

      const records = siafData.cabecera.map((item) => {
        const sRaw = Array.isArray(item.sujetos) ? item.sujetos : [];
        const procs = sRaw
          .filter((s) => {
            const t = String(s.tipo || "").trim().toUpperCase();
            return t === "PROCESADO" || t === "SOSPECHOSO" || t === "APREHENDIDO" || t === "DETENIDO";
          })
          .map((s) => String(s.persona || "").trim().toUpperCase())
          .filter(Boolean);
        const todos = sRaw
          .filter((s) => String(s.persona || "").trim().length > 0)
          .map((s) => `${String(s.persona || "").trim().toUpperCase()} (${String(s.tipo || "").trim().toUpperCase()})`);

        return {
          ndd: String(item.ndd || item.ndd1 || "").trim(),
          fecha: String(item.fecha || "").trim(),
          hora: String(item.hora || "").trim(),
          delito: String(item.gen_delito_tipopenal || "").trim().toUpperCase(),
          detenidos: procs.join(", ") || (todos.length > 0 ? todos.join(", ") : ""),
          procesadosCount: procs.length,
          sujetos: sRaw,
        };
      });

      const row = siafData.cabecera[0];
      const delito = String(row.gen_delito_tipopenal || "").trim().toUpperCase();
      const sujetosRaw = Array.isArray(row.sujetos) ? row.sujetos : [];
      const procesados = sujetosRaw
        .filter((s) => {
          const t = String(s.tipo || "").trim().toUpperCase();
          return t === "PROCESADO" || t === "SOSPECHOSO" || t === "APREHENDIDO" || t === "DETENIDO";
        })
        .map((s) => String(s.persona || "").trim().toUpperCase())
        .filter(Boolean);

      resolve({
        success: true,
        found: true,
        source: "extension",
        delito,
        detenidos: procesados.join(", "),
        procesadosCount: procesados.length,
        fecha: String(row.fecha || "").trim(),
        ndd: String(row.ndd || row.ndd1 || ""),
        records,
      });
    };

    window.addEventListener("FISCALIA_EXTENSION_RESPONSE_" + id, handleResponse);
    window.dispatchEvent(
      new CustomEvent("FISCALIA_EXTENSION_REQUEST", {
        detail: { id, criterio, valor },
      })
    );
  });
}

export async function consultarFiscaliaConFallback(queryString: string) {
  const isLocal = isLocalHostOrNetwork();

  // 1. Extraer criterio y valor de la query
  const params = new URLSearchParams(queryString);
  const valor = (params.get("valor") || params.get("oficio") || params.get("ndd") || "").trim();
  let criterio = params.get("criterio") || "6";
  if (params.has("oficio")) criterio = "6";
  else if (params.has("ndd")) criterio = "1";

  // 2. Si el Conector de Navegador está instalado, consultar directamente (evita WAF 100%)
  if (isExtensionInstalled() && valor) {
    try {
      const extRes = await consultarViaExtension(criterio, valor);
      if (extRes && extRes.success) {
        return extRes;
      }
    } catch (e) {
      console.warn("Fallo temporal en Conector de Navegador, usando API:", e);
    }
  }

  // 3. Consultar endpoint normal (/api/consulta-fiscalia)
  try {
    const res = await fetch(`/api/consulta-fiscalia?${queryString}`);
    if (res.ok) {
      const json = await res.json();

      if (json.success) {
        return json;
      }

      // Si la llamada en la nube devolvió 403 (bloqueo WAF de Imperva a los datacenters de Vercel/Cloudflare)
      const isCloudBlocked =
        !json.success &&
        Boolean(json.error && (json.error.includes("403") || json.error.includes("Fiscalía") || json.error.includes("WAF") || json.error.includes("Proxy")));

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
            json.error || "No se pudo conectar con el servicio de Fiscalía en este momento. Reintenta en unos instantes.",
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
