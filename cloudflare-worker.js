/**
 * CLOUDFLARE WORKER PARA CONSULTA DE FISCALÍA (SIAF ECUADOR)
 * 
 * Permite hasta 100,000 consultas gratuitas al día.
 * Realiza la petición directa por POST al servicio AJAX de la Fiscalía
 * sin dependencias de sesiones ni cookies previas que activen el WAF.
 * 
 * INSTRUCCIONES:
 * 1. Abre https://dash.cloudflare.com -> Workers & Pages -> Selecciona tu Worker
 * 2. Clic en "Edit code" (Editar código)
 * 3. Borra todo lo anterior, pega este código y presiona "Save and deploy" (Guardar y desplegar).
 */

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    };

    // 1. Manejo de Preflight OPTIONS para CORS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders, status: 204 });
    }

    const url = new URL(request.url);

    // 2. Ping de verificación de estado y latencia
    if (url.searchParams.get("ping") === "1" || url.pathname === "/ping") {
      return new Response(
        JSON.stringify({
          success: true,
          status: "online",
          worker: "Cloudflare-Fiscalia-Proxy",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 3. Parámetros de consulta
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
        JSON.stringify({ error: "Parámetro 'valor' inválido o demasiado corto (mínimo 8 dígitos)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const AJAX_URL =
      "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/AJX_consulta_noticiasdelito.php";
    const REFERER_URL =
      "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/consulta_ciudadana.php";

    try {
      // 4. Preparación de datos del formulario POST
      const bodyParams = new URLSearchParams();
      bodyParams.append("tipo", "buscar_general");
      bodyParams.append("criterio", String(criterio));
      bodyParams.append("valor", String(valor));

      // 5. Petición directa a la Fiscalía sin llamadas previas a redirect.php
      const postRes = await fetch(AJAX_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          Referer: REFERER_URL,
          Origin: "https://www.gestiondefiscalias.gob.ec",
          Accept: "application/json, text/javascript, */*; q=0.01",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        body: bodyParams.toString(),
      });

      const responseText = await postRes.text();

      // 6. Verificar si la respuesta es un JSON válido del sistema SIAF
      try {
        const jsonData = JSON.parse(responseText);
        return new Response(JSON.stringify(jsonData), {
          status: 200,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json; charset=utf-8",
          },
        });
      } catch {
        // En caso de que el WAF responda con HTML o error
        return new Response(
          JSON.stringify({
            error: `La Fiscalía respondió con código ${postRes.status} (no es JSON)`,
            status: postRes.status,
            raw: responseText.slice(0, 400),
          }),
          {
            status: postRes.status === 200 ? 502 : postRes.status,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json; charset=utf-8",
            },
          }
        );
      }
    } catch (err) {
      return new Response(
        JSON.stringify({
          error: err instanceof Error ? err.message : "Error interno en el Worker de Cloudflare",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }
  },
};
