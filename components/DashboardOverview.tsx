"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type SourceKey = "delegaciones" | "partes" | "delegaciones_viejas" | "partes_viejos";

type SourceConfig = {
  key: SourceKey;
  label: string;
  table: "Arch_dele" | "PARTES" | "delegaciones_viejas" | "partes_viejas";
  column: string;
  color: string;
};

type SourceStatus = {
  key: SourceKey;
  label: string;
  selectedYear: string;
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

type MonthlyDelegacionesStatus = {
  total: number;
  cumplidas: number;
  pendientes: number;
  porcentajeCumplimiento: number;
  peritoConMasPendientes: string;
  pendientesPeritoTop: number;
};

const SOURCES: SourceConfig[] = [
  {
    key: "delegaciones",
    label: "Delegaciones",
    table: "Arch_dele",
    column: "CIERRE",
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

const MONTH_OPTIONS = [
  { value: "01", label: "01 - Enero" },
  { value: "02", label: "02 - Febrero" },
  { value: "03", label: "03 - Marzo" },
  { value: "04", label: "04 - Abril" },
  { value: "05", label: "05 - Mayo" },
  { value: "06", label: "06 - Junio" },
  { value: "07", label: "07 - Julio" },
  { value: "08", label: "08 - Agosto" },
  { value: "09", label: "09 - Septiembre" },
  { value: "10", label: "10 - Octubre" },
  { value: "11", label: "11 - Noviembre" },
  { value: "12", label: "12 - Diciembre" },
] as const;

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

const toText = (value: unknown): string => String(value ?? "").trim();

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

const toStatus = (config: SourceConfig, selectedYear: string, rawDate: unknown): SourceStatus => {
  const normalized = normalizeDateValue(rawDate);
  const parsed = parseIsoDate(normalized);

  if (!parsed) {
    return {
      key: config.key,
      label: config.label,
      selectedYear,
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
    selectedYear,
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

const buildYearRange = (year: string): { from: string; to: string } => ({
  from: `${year}-01-01`,
  to: `${year}-12-31`,
});

const getMonthDateRange = (year: string, month: string): { from: string; to: string } => {
  const y = Number(year);
  const m = Number(month);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthPadded = String(m).padStart(2, "0");
  return {
    from: `${year}-${monthPadded}-01`,
    to: `${year}-${monthPadded}-${String(lastDay).padStart(2, "0")}`,
  };
};

const createEmptyMonthlyStatus = (): MonthlyDelegacionesStatus => ({
  total: 0,
  cumplidas: 0,
  pendientes: 0,
  porcentajeCumplimiento: 0,
  peritoConMasPendientes: "Sin pendientes",
  pendientesPeritoTop: 0,
});

const CURRENT_YEAR = String(new Date().getFullYear());

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
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [errorText, setErrorText] = useState("");
  const [monthlyErrorText, setMonthlyErrorText] = useState("");
  const [statusRows, setStatusRows] = useState<SourceStatus[]>([]);
  const [yearsBySource, setYearsBySource] = useState<Record<SourceKey, string[]>>({
    delegaciones: [CURRENT_YEAR],
    partes: [CURRENT_YEAR],
    delegaciones_viejas: [CURRENT_YEAR],
    partes_viejos: [CURRENT_YEAR],
  });
  const [selectedYearBySource, setSelectedYearBySource] = useState<Record<SourceKey, string>>({
    delegaciones: CURRENT_YEAR,
    partes: CURRENT_YEAR,
    delegaciones_viejas: CURRENT_YEAR,
    partes_viejos: CURRENT_YEAR,
  });

  const [delegacionesMonthYears, setDelegacionesMonthYears] = useState<string[]>([CURRENT_YEAR]);
  const [selectedMonthYear, setSelectedMonthYear] = useState(CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [monthlyStatus, setMonthlyStatus] = useState<MonthlyDelegacionesStatus>(createEmptyMonthlyStatus());
  const statusCacheRef = useRef<Record<string, SourceStatus>>({});
  const monthlyCacheRef = useRef<Record<string, MonthlyDelegacionesStatus>>({});

  const fetchYearsForSource = useCallback(async (table: SourceConfig["table"] | "FLAGRANCIA", column: string): Promise<string[]> => {
    const PAGE_SIZE = 1000;
    let from = 0;
    const years = new Set<string>();

    while (true) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .not(column, "is", null)
        .order(column, { ascending: false })
        .range(from, to);

      if (error) break;

      const chunk = (((data || []) as unknown[]) as Array<Record<string, unknown>>);
      chunk.forEach((row) => {
        const normalized = normalizeDateValue(row[column]);
        const year = normalized.split("-")[0] || "";
        if (/^\d{4}$/.test(year)) years.add(year);
      });

      if (chunk.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const sorted = Array.from(years).sort((a, b) => Number(b) - Number(a));
    return sorted.length > 0 ? sorted : [CURRENT_YEAR];
  }, []);

  const fetchStatusForYear = useCallback(async (source: SourceConfig, year: string): Promise<SourceStatus> => {
    const cacheKey = `${source.key}:${year}`;
    const cached = statusCacheRef.current[cacheKey];
    if (cached) return cached;

    const range = buildYearRange(year);
    const { data, error } = await supabase
      .from(source.table)
      .select(source.column)
      .gte(source.column, range.from)
      .lte(source.column, range.to)
      .order(source.column, { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Error en ${source.label}: ${error.message}`);
    }

    const row = ((((data || []) as unknown[]) as Array<Record<string, unknown>>)[0]) || {};
    const status = toStatus(source, year, row[source.column]);
    statusCacheRef.current[cacheKey] = status;
    return status;
  }, []);

  const loadMonthlyDelegaciones = useCallback(async (year: string, month: string) => {
    const cacheKey = `${year}-${month}`;
    const cached = monthlyCacheRef.current[cacheKey];
    if (cached) {
      setMonthlyStatus(cached);
      setMonthlyLoading(false);
      return;
    }

    setMonthlyLoading(true);
    setMonthlyErrorText("");

    try {
      const range = getMonthDateRange(year, month);
      const PAGE_SIZE = 1000;
      let from = 0;
      let total = 0;
      let cumplidas = 0;
      let pendientes = 0;
      const pendingByPerito = new Map<string, number>();

      while (true) {
        const to = from + PAGE_SIZE - 1;
        const { data, error } = await supabase
          .from("FLAGRANCIA")
          .select("F_RECEPCION, CUMPLIMIENTO_TOTAL, PERITO")
          .gte("F_RECEPCION", range.from)
          .lte("F_RECEPCION", range.to)
          .range(from, to);

        if (error) {
          throw new Error(error.message);
        }

        const chunk = (((data || []) as unknown[]) as Array<Record<string, unknown>>);
        chunk.forEach((row) => {
          total += 1;
          const cumplimiento = toText(row["CUMPLIMIENTO_TOTAL"]).toUpperCase();
          if (cumplimiento === "SI") {
            cumplidas += 1;
            return;
          }

          pendientes += 1;
          const perito = toText(row["PERITO"]) || "SIN PERITO";
          pendingByPerito.set(perito, (pendingByPerito.get(perito) || 0) + 1);
        });

        if (chunk.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      let peritoConMasPendientes = "Sin pendientes";
      let pendientesPeritoTop = 0;
      pendingByPerito.forEach((count, name) => {
        if (count > pendientesPeritoTop) {
          pendientesPeritoTop = count;
          peritoConMasPendientes = name;
        }
      });

      const porcentajeCumplimiento = total > 0 ? Number(((cumplidas / total) * 100).toFixed(1)) : 0;

      const summary = {
        total,
        cumplidas,
        pendientes,
        porcentajeCumplimiento,
        peritoConMasPendientes,
        pendientesPeritoTop,
      };

      monthlyCacheRef.current[cacheKey] = summary;
      setMonthlyStatus(summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar delegaciones por mes";
      setMonthlyErrorText(message);
      setMonthlyStatus(createEmptyMonthlyStatus());
    } finally {
      setMonthlyLoading(false);
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setErrorText("");

    try {
      const yearsEntries = await Promise.all(
        SOURCES.map(async (source) => [source.key, await fetchYearsForSource(source.table, source.column)] as const)
      );

      const nextYearsBySource = yearsEntries.reduce<Record<SourceKey, string[]>>((acc, entry) => {
        acc[entry[0]] = entry[1];
        return acc;
      }, {
        delegaciones: [CURRENT_YEAR],
        partes: [CURRENT_YEAR],
        delegaciones_viejas: [CURRENT_YEAR],
        partes_viejos: [CURRENT_YEAR],
      });

      const nextSelectedYears = Object.keys(nextYearsBySource).reduce<Record<SourceKey, string>>((acc, key) => {
        const sourceKey = key as SourceKey;
        acc[sourceKey] = nextYearsBySource[sourceKey][0] || CURRENT_YEAR;
        return acc;
      }, {
        delegaciones: CURRENT_YEAR,
        partes: CURRENT_YEAR,
        delegaciones_viejas: CURRENT_YEAR,
        partes_viejos: CURRENT_YEAR,
      });

      setYearsBySource(nextYearsBySource);
      setSelectedYearBySource(nextSelectedYears);

      const results = await Promise.all(
        SOURCES.map((source) => fetchStatusForYear(source, nextSelectedYears[source.key]))
      );

      setStatusRows(results);

      const monthYears = await fetchYearsForSource("FLAGRANCIA", "F_RECEPCION");
      setDelegacionesMonthYears(monthYears);
      const defaultMonthYear = monthYears[0] || CURRENT_YEAR;
      setSelectedMonthYear(defaultMonthYear);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo cargar el dashboard";
      setErrorText(message);
    } finally {
      setLoading(false);
    }
  }, [fetchStatusForYear, fetchYearsForSource]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (loading) return;
    void loadMonthlyDelegaciones(selectedMonthYear, selectedMonth);
  }, [selectedMonthYear, selectedMonth, loadMonthlyDelegaciones, loading]);

  const handleYearChange = async (key: SourceKey, year: string) => {
    setSelectedYearBySource((prev) => ({ ...prev, [key]: year }));

    try {
      const source = SOURCES.find((item) => item.key === key);
      if (!source) return;
      const nextStatus = await fetchStatusForYear(source, year);
      setStatusRows((prev) => prev.map((row) => (row.key === key ? nextStatus : row)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo actualizar el año seleccionado";
      setErrorText(message);
    }
  };

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

      <article className="rounded-3xl border border-amber-300/20 bg-gradient-to-r from-slate-900/75 via-slate-900/65 to-amber-950/40 p-5 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h4 className="text-lg font-black text-white">Delegaciones por Mes (FLAGRANCIA)</h4>
            <p className="text-[11px] uppercase tracking-wider text-white/45 font-bold">F_RECEPCION + CUMPLIMIENTO_TOTAL (SI/NO)</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select
              value={selectedMonthYear}
              onChange={(event) => setSelectedMonthYear(event.target.value)}
              className="bg-black/35 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none"
            >
              {delegacionesMonthYears.map((year) => (
                <option key={`month-year-${year}`} value={year} className="bg-slate-900 text-white">
                  {year}
                </option>
              ))}
            </select>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="bg-black/35 border border-white/15 rounded-xl px-3 py-2 text-xs text-white outline-none"
            >
              {MONTH_OPTIONS.map((month) => (
                <option key={`month-${month.value}`} value={month.value} className="bg-slate-900 text-white">
                  {month.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {monthlyErrorText && (
          <div className="mt-3 rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-xs text-red-200">{monthlyErrorText}</div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-black/25 border border-white/10 p-3">
            <p className="text-[10px] text-white/50 uppercase font-bold">Total Delegaciones</p>
            <p className="text-2xl font-black text-white">{monthlyLoading ? "..." : monthlyStatus.total}</p>
          </div>
          <div className="rounded-2xl bg-black/25 border border-white/10 p-3">
            <p className="text-[10px] text-white/50 uppercase font-bold">Cumplidas (SI)</p>
            <p className="text-2xl font-black text-emerald-300">{monthlyLoading ? "..." : monthlyStatus.cumplidas}</p>
          </div>
          <div className="rounded-2xl bg-black/25 border border-white/10 p-3">
            <p className="text-[10px] text-white/50 uppercase font-bold">Pendientes (NO)</p>
            <p className="text-2xl font-black text-amber-300">{monthlyLoading ? "..." : monthlyStatus.pendientes}</p>
          </div>
          <div className="rounded-2xl bg-black/25 border border-white/10 p-3">
            <p className="text-[10px] text-white/50 uppercase font-bold">% Cumplimiento</p>
            <p className="text-2xl font-black text-cyan-200">{monthlyLoading ? "..." : `${monthlyStatus.porcentajeCumplimiento}%`}</p>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">
          <p className="text-[10px] text-white/50 uppercase font-bold">Perito con más pendientes (NO)</p>
          <p className="text-sm font-black text-amber-200 mt-1">
            {monthlyLoading
              ? "Calculando..."
              : `${monthlyStatus.peritoConMasPendientes} (${monthlyStatus.pendientesPeritoTop})`}
          </p>
        </div>
      </article>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {statusRows.map((row) => {
          const displayDate = formatIsoDisplay(row.lastDate);
          const sourceYears = yearsBySource[row.key] || [CURRENT_YEAR];
          return (
            <article key={row.key} className="rounded-3xl border border-white/10 bg-slate-900/55 p-5 backdrop-blur-xl shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black text-white">{row.label}</h4>
                  <p className="text-[11px] uppercase tracking-wider text-white/45 font-bold">Último cierre ({row.selectedYear}): {displayDate}</p>
                  <div className="mt-2">
                    <label className="text-[10px] uppercase font-black text-white/40">Año</label>
                    <select
                      value={selectedYearBySource[row.key] || row.selectedYear}
                      onChange={(event) => handleYearChange(row.key, event.target.value)}
                      className="ml-2 bg-black/35 border border-white/15 rounded-lg px-2 py-1 text-[11px] text-white outline-none"
                    >
                      {sourceYears.map((year) => (
                        <option key={`${row.key}-${year}`} value={year} className="bg-slate-900 text-white">
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Ring value={row.yearProgress} color="#34d399" />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="flex justify-between text-[11px] font-bold text-white/70 mb-1">
                    <span>Progreso del año</span>
                    <span>{row.yearProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-400" style={{ width: `${row.yearProgress}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 mt-2">
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
