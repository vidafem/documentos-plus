/**
 * CLOUDFLARE WORKER PARA CONSULTA DE FISCALÍA
 * 
 * Permite realizar hasta 100,000 consultas gratuitas al día.
 * Se encarga de inicializar la sesión con PHPSESSID a través de redirect.php
 * y luego consultar el servicio AJAX de noticias del delito.
 * 
 * INSTRUCCIONES:
 * 1. Ve a dash.cloudflare.com -> Workers & Pages
 * 2. Selecciona tu Worker (ej: fiscalia-api) -> Edit code
 * 3. Reemplaza todo el contenido con este script y dale "Save and deploy".
 * 4. En Vercel, coloca en FISCALIA_PROXY_URL la URL de este worker:
 *    https://tu-worker.tu-cuenta.workers.dev
 */

export default {
  async fetch(request) {
    // 1. Manejo de CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const valor = (
      url.searchParams.get("valor") ||
      url.searchParams.get("oficio") ||
      url.searchParams.get("ndd") ||
      ""
    ).trim();

    let criterio = url.searchParams.get("criterio") || "6";
    if (criterio === "cedula" || criterio === "2") criterio = "2";
    else if (criterio === "ruc" || criterio === "3") criterio = "3";
    else if (criterio === "ndd" || criterio === "1") criterio = "1";
    else if (criterio === "oficio" || criterio === "6") criterio = "6";

    if (!valor || valor.length < 8) {
      return new Response(
        JSON.stringify({ error: "Parámetro 'valor' inválido o demasiado corto" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const MAIN_URL =
      "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/redirect.php?data=L3Zhci93d3cvaHRtbC9zaWFmL2luZm9ybWFjaW9uL3dlYi9ub3RpY2lhc2RlbGl0by8uLi8uLi8uLi9zaXRpby9jb25zdWx0YV9uZGRfZXh0L2NvbnN1bHRhX2NpdWRhZGFuYS5waHA%3D";
    const AJAX_URL =
      "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/AJX_consulta_noticiasdelito.php";
    const USER_AGENT =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    try {
      // Paso 1: Obtener cookies de sesión iniciales desde redirect.php
      const mainRes = await fetch(MAIN_URL, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "es-419,es;q=0.9",
        },
      });

      // Extraer cookies
      let rawCookies = "";
      if (typeof mainRes.headers.getSetCookie === "function") {
        rawCookies = mainRes.headers
          .getSetCookie()
          .map((c) => c.split(";")[0])
          .join("; ");
      } else {
        rawCookies = (mainRes.headers.get("set-cookie") || "")
          .split(",")
          .map((c) => c.split(";")[0])
          .join("; ");
      }

      // Paso 2: Ejecutar POST a la Fiscalía con las cookies
      const bodyParams = new URLSearchParams();
      bodyParams.append("tipo", "buscar_general");
      bodyParams.append("criterio", criterio);
      bodyParams.append("valor", valor);

      const postRes = await fetch(AJAX_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: MAIN_URL,
          Origin: "https://www.gestiondefiscalias.gob.ec",
          Cookie: rawCookies,
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "es-419,es;q=0.9",
        },
        body: bodyParams.toString(),
      });

      const responseText = await postRes.text();

      return new Response(responseText, {
        status: postRes.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Error en proxy Cloudflare",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
};
