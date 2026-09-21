const http = require("http");
const querystring = require("querystring");

const PORT = 3005;
const AJAX_URL =
  "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/AJX_consulta_noticiasdelito.php";
const REFERER_URL =
  "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/consulta_ciudadana.php";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.searchParams.get("ping") === "1" || url.pathname === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, status: "online", source: "Cloudflare-Tunnel-Local" }));
    return;
  }

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
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Valor inválido o demasiado corto" }));
    return;
  }

  try {
    const postData = querystring.stringify({
      tipo: "buscar_general",
      criterio: criterio,
      valor: valor,
    });

    const fRes = await fetch(AJAX_URL, {
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
      body: postData,
    });

    const body = await fRes.text();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[Fiscalia Bridge] Escuchando en http://127.0.0.1:${PORT}`);
});
