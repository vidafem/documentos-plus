import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET() {
  try {
    const directoryPath = path.join(process.cwd(), "public", "formatos");
    if (!fs.existsSync(directoryPath)) {
      return NextResponse.json({ templates: [] });
    }

    const files = fs.readdirSync(directoryPath);
    
    // Filter files matching "formato_delegaciones*.html"
    const templates = files
      .filter((file) => file.startsWith("formato_delegaciones") && file.endsWith(".html"))
      .map((file) => {
        // e.g. "formato_delegaciones_prop.html" -> "_prop" -> "prop" -> "PROP"
        const suffix = file
          .replace("formato_delegaciones", "")
          .replace(".html", "")
          .replace(/^[_-]/, "")
          .trim();

        const displayName = suffix
          ? suffix.charAt(0).toUpperCase() + suffix.slice(1).replace(/[_-]/g, " ")
          : "Original";

        return {
          filename: file,
          displayName,
        };
      });

    return NextResponse.json({ templates });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: `No se pudo leer el directorio de formatos: ${msg}` }, { status: 500 });
  }
}
