"use client";
import { useEffect } from 'react';

interface NotificationProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

export default function Notification({ message, type, onClose }: NotificationProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const baseClasses = "fixed top-5 left-1/2 -translate-x-1/2 z-[200] text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 animate-in fade-in zoom-in slide-in-from-top-5 duration-300";
  
  const config = {
    success: {
      classes: "bg-emerald-600 border border-emerald-400/30",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      )
    },
    error: {
      classes: "bg-red-600 border border-red-400/30",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    },
    info: {
      classes: "bg-blue-600 border border-blue-400/30",
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    }
  };

  const current = config[type];

  return (
    <div className={`${baseClasses} ${current.classes}`}>
      {current.icon}
      <span className="text-xs font-bold uppercase tracking-wide">{message}</span>
    </div>
  );
}