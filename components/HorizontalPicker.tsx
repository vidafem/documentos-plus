"use client";

import React, { useState, useRef, useEffect } from "react";

interface HorizontalPickerProps {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  columns?: number;
  align?: "left" | "center" | "right";
  disabled?: boolean;
  className?: string;
  title?: string;
}

export default function HorizontalPicker({
  value,
  onChange,
  options,
  columns = 6,
  align = "center",
  disabled = false,
  className = "",
  title,
}: HorizontalPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const alignClasses =
    align === "right"
      ? "right-0"
      : align === "left"
      ? "left-0"
      : "left-1/2 -translate-x-1/2";

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full bg-neutral-900 text-white border border-white/10 rounded-lg py-1 px-2 text-xs font-bold flex items-center justify-between hover:border-indigo-500/50 focus:border-indigo-500 transition-all cursor-pointer select-none ${
          isOpen ? "border-indigo-500 ring-1 ring-indigo-500/40" : ""
        } ${className}`}
        title={title}
      >
        <span className="font-mono">{value || "--"}</span>
        <svg
          className={`w-3 h-3 text-white/40 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-indigo-400" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute top-full mt-1.5 z-[100] bg-neutral-950/95 backdrop-blur-xl border border-white/20 rounded-xl p-2 shadow-2xl shadow-black/90 animate-in fade-in zoom-in-95 duration-150 ${alignClasses}`}
          style={{ width: "max-content", maxWidth: "min(92vw, 320px)" }}
        >
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {options.map((opt) => {
              const isSelected = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                  }}
                  className={`h-7 w-8 rounded-lg text-xs font-mono font-bold flex items-center justify-center transition-all cursor-pointer select-none ${
                    isSelected
                      ? "bg-indigo-600 text-white font-black shadow-md shadow-indigo-500/50 ring-1 ring-indigo-300 scale-105"
                      : "bg-white/5 hover:bg-white/20 text-white/80 hover:text-white hover:scale-105"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
