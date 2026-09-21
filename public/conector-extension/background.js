/**
 * Conector de Fiscalía - Background Service Worker (Manifest V3)
 * Ejecuta consultas directas a Fiscalía desde el navegador del usuario en Ecuador,
 * esquivando las restricciones de WAF impuestas a datacenters como Vercel y Cloudflare.
 */

const MAIN_URL =
  "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/redirect.php?data=L3Zhci93d3cvaHRtbC9zaWFmL2luZm9ybWFjaW9uL3dlYi9ub3RpY2lhc2RlbGl0by8uLi8uLi8uLi9zaXRpby9jb25zdWx0YV9uZGRfZXh0L2NvbnN1bHRhX2NpdWRhZGFuYS5waHA%3D";
const REFERER_URL =
  "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/consulta_ciudadana.php";
const AJAX_URL =
  "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/AJX_consulta_noticiasdelito.php";

async function consultarFiscaliaDirecto(criterio, valor) {
  try {
    // Paso 1: Petición inicial para establecer sesión
    const getRes = await fetch(MAIN_URL, {
      method: "GET",
      credentials: "include"
    });

    // Paso 2: Extraer cookies si están disponibles
    let cookiesStr = "";
    if (typeof getRes.headers.getSetCookie === "function") {
      cookiesStr = getRes.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
    }

    // Paso 3: Petición POST con el criterio y valor
    const bodyParams = new URLSearchParams();
    bodyParams.append("tipo", "buscar_general");
    bodyParams.append("criterio", String(criterio));
    bodyParams.append("valor", String(valor));

    const postHeaders = {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "Referer": REFERER_URL,
      "Origin": "https://www.gestiondefiscalias.gob.ec"
    };

    if (cookiesStr) {
      postHeaders["Cookie"] = cookiesStr;
    }

    const postRes = await fetch(AJAX_URL, {
      method: "POST",
      headers: postHeaders,
      body: bodyParams.toString(),
      credentials: "include"
    });

    const responseText = await postRes.text();

    try {
      const data = JSON.parse(responseText);
      return {
        success: true,
        status: postRes.status,
        data: data
      };
    } catch {
      return {
        success: false,
        status: postRes.status,
        raw: responseText.slice(0, 500),
        error: "La respuesta no es JSON válido (código " + postRes.status + ")"
      };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Error desconocido en el conector"
    };
  }
}

// Escuchar mensajes desde content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "PING_CONNECTOR") {
    sendResponse({ active: true, version: "1.0.0" });
    return true;
  }

  if (request.type === "QUERY_FISCALIA") {
    consultarFiscaliaDirecto(request.criterio, request.valor)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Respuesta asíncrona
  }
});
