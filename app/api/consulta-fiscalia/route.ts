import { NextRequest, NextResponse } from "next/server";
import https from "node:https";
import querystring from "node:querystring";

export const dynamic = "force-dynamic";

const MAIN_URL =
  "https://www.gestiondefiscalias.gob.ec/siaf/sitio/consulta_ndd_ext/redirect.php?data=L3Zhci93d3cvaHRtbC9zaWFmL2luZm9ybWFjaW9uL3dlYi9ub3RpY2lhc2RlbGl0by8uLi8uLi8uLi9zaXRpby9jb25zdWx0YV9uZGRfZXh0L2NvbnN1bHRhX2NpdWRhZGFuYS5waHA%3D";

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
  numeroinf?: string;
  gen_delito_tipopenal?: string;
  sujetos?: SujetoResponse[];
}

interface SiafResponse {
  error?: string;
  cabecera?: CabeceraItem[];
}

function fetchWithSession(oficio: string): Promise<SiafResponse> {
  return new Promise((resolve, reject) => {
    const timeoutTimer = setTimeout(() => {
      reject(new Error("Tiempo de espera agotado al consultar la Fiscalía (Timeout)"));
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
          "Accept-Language": "es-ES,es;q=0.9",
        },
      },
      (res) => {
        const rawCookies = res.headers["set-cookie"] || [];
        const cookies = rawCookies.map((c) => c.split(";")[0]).join("; ");

        let getBody = "";
        res.on("data", (chunk) => (getBody += chunk));
        res.on("end", () => {
          const postData = querystring.stringify({
            tipo: "buscar_general",
            criterio: 6, // Criterio 6: Nro. de Oficio
            valor: oficio,
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
              },
            },
            (postRes) => {
              let postBody = "";
              postRes.on("data", (chunk) => (postBody += chunk));
              postRes.on("end", () => {
                clearTimeout(timeoutTimer);
                try {
                  const json = JSON.parse(postBody) as SiafResponse;
                  resolve(json);
                } catch {
                  reject(new Error("La respuesta de la Fiscalía no es JSON válido."));
                }
              });
            }
          );

          postReq.on("error", (err) => {
            clearTimeout(timeoutTimer);
            reject(err);
          });

          postReq.write(postData);
          postReq.end();
        });
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
  const oficio = (searchParams.get("oficio") || "").trim();

  if (!oficio || oficio.length < 8) {
    return NextResponse.json(
      { success: false, found: false, message: "El código de oficio debe contener al menos 8 caracteres." },
      { status: 400 }
    );
  }

  // Verificar caché en memoria
  const cached = memoryCache.get(oficio);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data);
  }

  try {
    const siafData = await fetchWithSession(oficio);

    if (siafData.error || !siafData.cabecera || siafData.cabecera.length === 0) {
      const notFoundPayload = {
        success: true,
        found: false,
        message: "No se encontraron registros para este oficio en Fiscalía.",
      };
      // Guardar también resultados negativos en caché por 1 hora para evitar reintentos continuos del mismo número incorrecto
      memoryCache.set(oficio, { data: notFoundPayload, timestamp: Date.now() - (CACHE_TTL_MS - 60 * 60 * 1000) });
      return NextResponse.json(notFoundPayload);
    }

    const row = siafData.cabecera[0];
    const delito = String(row.gen_delito_tipopenal || "").trim().toUpperCase();

    const sujetosRaw = Array.isArray(row.sujetos) ? row.sujetos : [];
    const procesados = sujetosRaw
      .filter((s) => String(s.tipo || "").trim().toUpperCase() === "PROCESADO")
      .map((s) => String(s.persona || "").trim().toUpperCase())
      .filter(Boolean);

    const detenidos = procesados.join(", ");

    const foundPayload = {
      success: true,
      found: true,
      delito,
      detenidos,
      procesadosCount: procesados.length,
      ndd: String(row.ndd || row.ndd1 || ""),
    };

    memoryCache.set(oficio, { data: foundPayload, timestamp: Date.now() });

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
