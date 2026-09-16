import { NextRequest, NextResponse } from "next/server";
import http from "node:http";
import https from "node:https";
import querystring from "node:querystring";
import zlib from "node:zlib";

export const dynamic = "force-dynamic";
export const preferredRegion = ["gru1", "iad1"];

const MAIN_URL =
  "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/consulta_ciudadana.php";

const AJAX_URL =
  "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/AJX_consulta_noticiasdelito.php";

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

interface SiafResponse {
  error?: string;
  cabecera?: CabeceraItem[];
}

function decompressStream(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const encoding = (res.headers["content-encoding"] || "").toLowerCase();
    let stream: NodeJS.ReadableStream = res;
    if (encoding === "gzip") {
      stream = res.pipe(zlib.createGunzip());
    } else if (encoding === "br") {
      stream = res.pipe(zlib.createBrotliDecompress());
    } else if (encoding === "deflate") {
      stream = res.pipe(zlib.createInflate());
    }

    let body = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => (body += chunk));
    stream.on("end", () => resolve(body));
    stream.on("error", (err) => reject(err));
  });
}

function fetchWithSession(valor: string, criterioNumber: number = 6): Promise<SiafResponse> {
  return new Promise((resolve, reject) => {
    const timeoutTimer = setTimeout(() => {
      reject(new Error("Tiempo de espera agotado al consultar la Fiscalía (Timeout 12s)"));
    }, 12000);

    const getReq = https.get(
      MAIN_URL,
      {
        rejectUnauthorized: false,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
          "Accept-Encoding": "gzip, deflate, br",
          "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Upgrade-Insecure-Requests": "1",
        },
      },
      async (res) => {
        const rawCookies = res.headers["set-cookie"] || [];
        const cookies = rawCookies.map((c) => c.split(";")[0]).join("; ");

        // Drain get response
        try {
          await decompressStream(res);
        } catch {
          // Ignorar error de drenado en GET inicial
        }

        const postData = querystring.stringify({
          tipo: "buscar_general",
          criterio: criterioNumber,
          valor: valor,
        });

        const postReq = https.request(
          AJAX_URL,
          {
            method: "POST",
            rejectUnauthorized: false,
            headers: {
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "Content-Length": Buffer.byteLength(postData),
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "X-Requested-With": "XMLHttpRequest",
              Referer: MAIN_URL,
              Origin: "https://www.gestiondefiscalias.gob.ec",
              Cookie: cookies,
              Accept: "application/json, text/javascript, */*; q=0.01",
              "Accept-Encoding": "gzip, deflate, br",
              "Accept-Language": "es-419,es;q=0.9,en;q=0.8",
              "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
              "sec-ch-ua-mobile": "?0",
              "sec-ch-ua-platform": '"Windows"',
              "Sec-Fetch-Dest": "empty",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Site": "same-origin",
            },
          },
          async (postRes) => {
            clearTimeout(timeoutTimer);
            try {
              const body = await decompressStream(postRes);
              const json = JSON.parse(body) as SiafResponse;
              resolve(json);
            } catch {
              reject(
                new Error(
                  `La respuesta de la Fiscalía no es JSON válido (HTTP ${postRes.statusCode}).`
                )
              );
            }
          }
        );

        postReq.on("error", (err) => {
          clearTimeout(timeoutTimer);
          reject(err);
        });

        postReq.write(postData);
        postReq.end();
      }
    );

    getReq.on("error", (err) => {
      clearTimeout(timeoutTimer);
      reject(err);
    });
  });
}

interface CacheEntry {
  data: Record<string, unknown>;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas de caché

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const valor = (searchParams.get("oficio") || searchParams.get("ndd") || searchParams.get("valor") || "").trim();
  const rawCriterio = searchParams.get("criterio");

  let criterioNumber = 6;
  if (rawCriterio) {
    criterioNumber = Number(rawCriterio) || 6;
  } else if (/^\d{15}$/.test(valor)) {
    criterioNumber = 1; // 1: Noticia del Delito (15 dígitos)
  }

  if (!valor || valor.length < 8) {
    return NextResponse.json(
      { success: false, found: false, message: "El código debe contener al menos 8 caracteres." },
      { status: 400 }
    );
  }

  // Clave de caché por criterio y valor
  const cacheKey = `${criterioNumber}:${valor}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const siafData = await fetchWithSession(valor, criterioNumber);

    if (siafData.error || !siafData.cabecera || siafData.cabecera.length === 0) {
      const notFoundPayload = {
        success: true,
        found: false,
        message: "No se encontraron registros para este código en Fiscalía.",
      };
      memoryCache.set(cacheKey, { data: notFoundPayload, timestamp: Date.now() - (CACHE_TTL_MS - 60 * 60 * 1000) });
      return NextResponse.json(notFoundPayload);
    }

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

    const detenidos = procesados.join(", ");

    const foundPayload = {
      success: true,
      found: true,
      delito,
      detenidos,
      procesadosCount: procesados.length,
      fecha: String(row.fecha || "").trim(),
      ndd: String(row.ndd || row.ndd1 || ""),
    };

    memoryCache.set(cacheKey, { data: foundPayload, timestamp: Date.now() });

    return NextResponse.json(foundPayload);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido al consultar Fiscalía";
    return NextResponse.json(
      {
        success: false,
        found: false,
        error: msg,
      },
      { status: 200 }
    );
  }
}
