"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SourceKey = "delegaciones" | "partes" | "delegaciones_viejas" | "partes_viejos";

type SourceConfig = {
  key: SourceKey;
  label: string;
  table: "DELEGACIONES" | "PARTES" | "delegaciones_viejas" | "partes_viejas";
  column: string;
  color: string;
};

type SourceStatus = {
  key: SourceKey;
  label: string;
  lastDate: string;
  monthProgress: number;
  yearProgress: number;
  remainingMonthDays: number;
  remainingYearDays: number;
  monthClosed: boolean;
  yearClosed: boolean;
  hasData: boolean;
  color: string;
};

const SOURCES: SourceConfig[] = [
  {
    key: "delegaciones",
    label: "Delegaciones",
    table: "DELEGACIONES",
    column: "FECHA_CUMPLIMIENTO_O_DESCARGO_DE_DELEGACION",
    color: "#22d3ee",
  },
  {
    key: "partes",
    label: "Partes",
    table: "PARTES",
    column: "fecha_cierre",
    color: "#34d399",
  },
  {
    key: "delegaciones_viejas",
    label: "Delegaciones Viejas",
    table: "delegaciones_viejas",
    column: "fecha_cierre",
    color: "#60a5fa",
  },
  {
    key: "partes_viejos",
    label: "Partes Viejos",
    table: "partes_viejas",
    column: "fecha_cierre",
    color: "#f59e0b",
  },
];

const normalizeDateValue = (value: unknown): string => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const firstChunk = raw.split(" ")[0];

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(firstChunk)) {
    const [y, m, d] = firstChunk.split(/[/-]/);
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/.test(firstChunk)) {
    const [d, m, y] = firstChunk.split(/[/-]/);
    return `${y.padStart(4, "0")}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
};

const parseIsoDate = (value: string): Date | null => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return null;
  const [yearText, monthText, dayText] = normalized.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return new Date(Date.UTC(year, month - 1, day));
};

const formatIsoDisplay = (value: string): string => {
  const normalized = normalizeDateValue(value);
  if (!normalized) return "Sin datos";
  const [year, month, day] = normalized.split("-");
  return `${day}/${month}/${year}`;
};

const getDaysInMonthUtc = (year: number, monthIndexZeroBased: number): number =>
  new Date(Date.UTC(year, monthIndexZeroBased + 1, 0)).getUTCDate();

const getDaysInYearUtc = (year: number): number => {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);
  return Math.round((end - start) / 86400000);
};

const getDayOfYearUtc = (date: Date): number => {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  const now = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((now - start) / 86400000) + 1;
};

const toStatus = (config: SourceConfig, rawDate: unknown): SourceStatus => {
  const normalized = normalizeDateValue(rawDate);
  const parsed = parseIsoDate(normalized);

  if (!parsed) {
    return {
      key: config.key,
      label: config.label,
      lastDate: "",
      monthProgress: 0,
      yearProgress: 0,
      remainingMonthDays: 0,
      remainingYearDays: 0,
      monthClosed: false,
      yearClosed: false,
      hasData: false,
      color: config.color,
    };
  }

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const day = parsed.getUTCDate();

  const daysInMonth = getDaysInMonthUtc(year, month);
  const dayOfYear = getDayOfYearUtc(parsed);
  const daysInYear = getDaysInYearUtc(year);

  const monthClosed = day >= daysInMonth;
  const yearClosed = month === 11 && day === 31;

  const remainingMonthDays = monthClosed ? 0 : daysInMonth - day;
  const remainingYearDays = yearClosed ? 0 : Math.max(0, daysInYear - dayOfYear);

  return {
    key: config.key,
    label: config.label,
    lastDate: normalized,
    monthProgress: Number(((day / daysInMonth) * 100).toFixed(1)),
    yearProgress: Number(((dayOfYear / daysInYear) * 100).toFixed(1)),
    remainingMonthDays,
    remainingYearDays,
    monthClosed,
    yearClosed,
    hasData: true,
    color: config.color,
  };
};

const Ring = ({ value, color }: { value: number; color: string }) => {
  const safe = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-16 w-16 rounded-full grid place-items-center"
      style={{
        background: `conic-gradient(${color} ${safe}%, rgba(255,255,255,0.1) ${safe}% 100%)`,
      }}
    >
      <div className="h-12 w-12 rounded-full bg-slate-950/90 grid place-items-center text-[10px] font-black text-white">
        {safe}%
      </div>
    </div>
  );
};

export default function DashboardOverview() {
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [statusRows, setStatusRows] = useState<SourceStatus[]>([]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    try {
      const results = await Promise.all(
        SOURCES.map(async (source) => {
          const { data, error } = await supabase
            .from(source.table)
            .select(source.column)
            .not(source.column, "is", null)
            .order(source.column, { ascending: false })
            .limit(1);

          if (error) {
            throw new Error(`Error en ${source.label}: ${error.message}`);
          }

          const row = (((data || []) as unknown[]) as Array<Record<string, unknown>>)[0] || {};
          return toStatus(source, row[source.column]);
        })
      );

      setStatusRows(results);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el dashboard";
      setErrorText(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const globalStats = useMemo(() => {
    const withData = statusRows.filter((row) => row.hasData);
    if (withData.length === 0) {
      return {
        avgMonth: 0,
        avgYear: 0,
        monthClosedCount: 0,
        yearClosedCount: 0,
      };
    }

    const avgMonth = withData.reduce((acc, row) => acc + row.monthProgress, 0) / withData.length;
    const avgYear = withData.reduce((acc, row) => acc + row.yearProgress, 0) / withData.length;
    const monthClosedCount = withData.filter((row) => row.monthClosed).length;
    const yearClosedCount = withData.filter((row) => row.yearClosed).length;

    return {
      avgMonth: Number(avgMonth.toFixed(1)),
      avgYear: Number(avgYear.toFixed(1)),
      monthClosedCount,
      yearClosedCount,
    };
  }, [statusRows]);

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-cyan-300/20 bg-gradient-to-r from-slate-900/80 via-slate-900/70 to-cyan-950/50 p-5 shadow-[0_10px_45px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-cyan-200/80 font-black">Dashboard</p>
            <h3 className="text-xl md:text-2xl font-black text-white">Estado de Cierres por Módulo</h3>
            <p className="text-xs text-white/55 mt-1">Basado en la última fecha de cierre registrada en cada tabla.</p>
          </div>
          <button
            onClick={() => void loadSummary()}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/35 border border-cyan-300/30"
          >
            Actualizar
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-black/25 border border-white/10 p-3">
            <p className="text-[10px] text-white/50 uppercase font-bold">Avance Promedio Mes</p>
            <p className="text-2xl font-black text-cyan-200">{globalStats.avgMonth}%</p>
          </div>
          <div className="rounded-2xl bg-black/25 border border-white/10 p-3">
            <p className="text-[10px] text-white/50 uppercase font-bold">Avance Promedio Año</p>
            <p className="text-2xl font-black text-emerald-300">{globalStats.avgYear}%</p>
          </div>
          <div className="rounded-2xl bg-black/25 border border-white/10 p-3">
            <p className="text-[10px] text-white/50 uppercase font-bold">Cierres completos</p>
            <p className="text-sm font-bold text-white/80">
              Mes: <span className="text-cyan-200">{globalStats.monthClosedCount}</span> / {statusRows.length} | Año:{" "}
              <span className="text-emerald-300">{globalStats.yearClosedCount}</span> / {statusRows.length}
            </p>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">Cargando métricas...</div>
      )}

      {errorText && (
        <div className="rounded-2xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-200">{errorText}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {statusRows.map((row) => {
          const displayDate = formatIsoDisplay(row.lastDate);
          return (
            <article key={row.key} className="rounded-3xl border border-white/10 bg-slate-900/55 p-5 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black text-white">{row.label}</h4>
                  <p className="text-[11px] uppercase tracking-wider text-white/45 font-bold">Último cierre: {displayDate}</p>
                </div>
                <div className="flex gap-2">
                  <Ring value={row.monthProgress} color={row.color} />
                  <Ring value={row.yearProgress} color="#34d399" />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex justify-between text-[11px] font-bold text-white/70 mb-1">
                    <span>Progreso del mes</span>
                    <span>{row.monthProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${row.monthProgress}%`, backgroundColor: row.color }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] font-bold text-white/70 mb-1">
                    <span>Progreso del año</span>
                    <span>{row.yearProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${row.yearProgress}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-2">
                  <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                    <p className="text-[10px] text-white/45 uppercase font-bold">Mes</p>
                    <p className={`text-xs font-black ${row.monthClosed ? "text-emerald-300" : "text-amber-300"}`}>
                      {row.hasData ? (row.monthClosed ? "Cerrado" : `Faltan ${row.remainingMonthDays} día(s)`) : "Sin datos"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/25 p-2">
                    <p className="text-[10px] text-white/45 uppercase font-bold">Año</p>
                    <p className={`text-xs font-black ${row.yearClosed ? "text-emerald-300" : "text-amber-300"}`}>
                      {row.hasData ? (row.yearClosed ? "Cerrado" : `Faltan ${row.remainingYearDays} día(s)`) : "Sin datos"}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
