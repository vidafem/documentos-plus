/**
 * CLOUDFLARE WORKER PARA CONSULTA DE FISCALÍA
 * 
 * Permite realizar hasta 100,000 consultas gratuitas al día.
 * Se encarga de inicializar la sesión con PHPSESSID a través de redirect.php
 * y luego consultar el servicio AJAX de noticias del delito con cabeceras de navegador reales.
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

    const isDebug = url.searchParams.get("debug") === "1";

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
    const REFERER_URL =
      "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/consulta_ciudadana.php";
    const AJAX_URL =
      "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/AJX_consulta_noticiasdelito.php";
    const USER_AGENT =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    try {
      // Paso 1: Obtener cookies de sesión desde redirect.php
      const mainRes = await fetch(MAIN_URL, {
        method: "GET",
        headers: {
          "User-Agent": USER_AGENT,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
          "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      // Paso 2: Extraer limpiamente las cookies requeridas sin corromper fechas
      const cookieMap = new Map();

      if (typeof mainRes.headers.getSetCookie === "function") {
        for (const item of mainRes.headers.getSetCookie()) {
          const firstPart = item.split(";")[0].trim();
          const eqIdx = firstPart.indexOf("=");
          if (eqIdx > 0) {
            cookieMap.set(firstPart.slice(0, eqIdx).trim(), firstPart.slice(eqIdx + 1).trim());
          }
        }
      }

      if (!cookieMap.has("PHPSESSID")) {
        const raw = mainRes.headers.get("set-cookie") || "";
        const matches = raw.match(/(?:PHPSESSID|visid_incap_[0-9]+|incap_ses_[0-9_]+|___utmvc|nlbi_[0-9]+)=[^;,\s]+/gi);
        if (matches) {
          for (const m of matches) {
            const eqIdx = m.indexOf("=");
            if (eqIdx > 0) {
              cookieMap.set(m.slice(0, eqIdx).trim(), m.slice(eqIdx + 1).trim());
            }
          }
        }
      }

      const rawCookies = Array.from(cookieMap.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");

      // Paso 3: Preparar datos y ejecutar POST a la Fiscalía
      const bodyParams = new URLSearchParams();
      bodyParams.append("tipo", "buscar_general");
      bodyParams.append("criterio", criterio);
      bodyParams.append("valor", valor);

      const postRes = await fetch(AJAX_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: REFERER_URL,
          Origin: "https://www.gestiondefiscalias.gob.ec",
          Cookie: rawCookies,
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/javascript, */*; q=0.01",
          "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
          "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Site": "same-origin",
        },
        body: bodyParams.toString(),
      });

      const responseText = await postRes.text();

      if (isDebug) {
        return new Response(
          JSON.stringify({
            mainStatus: mainRes.status,
            cookiesExtracted: rawCookies,
            postStatus: postRes.status,
            postResponse: responseText.slice(0, 500),
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

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
