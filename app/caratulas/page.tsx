"use client";

import Background from "@/components/Background";
import CaratulasExcelModule from "@/components/caratulas/CaratulasExcelModule";

export default function CaratulasPage() {
  return (
    <main className="relative h-screen w-full bg-slate-950 p-2 md:p-4 overflow-hidden flex flex-col">
      <Background />
      <div className="relative z-10 flex-1 min-h-0 flex flex-col w-full h-full">
        <CaratulasExcelModule />
      </div>
    </main>
  );
}
