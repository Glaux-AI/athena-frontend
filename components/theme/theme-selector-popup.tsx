"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme } from "next-themes";
import { Modal } from "@/components/ui/overlay";

export function ThemeSelectorPopup() {
  const [open, setOpen] = useState(false);
  const { setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const preferenceSet = localStorage.getItem("theme-preference-set");
    if (!preferenceSet) {
      setOpen(true);
    }
  }, []);

  const handleSelect = (theme: "light" | "dark" | "system") => {
    setTheme(theme);
    localStorage.setItem("theme-preference-set", "true");
    setOpen(false);
  };

  if (!mounted) return null;

  return (
    <Modal
      open={open}
      onClose={() => {
        localStorage.setItem("theme-preference-set", "true");
        setOpen(false);
      }}
      title="Welcome to Athena"
      description="Please select your preferred theme."
      size="sm"
    >
      <div className="flex flex-col gap-2">
        {[
          { id: "light", label: "Light", icon: Sun },
          { id: "dark", label: "Dark", icon: Moon },
          { id: "system", label: "System", icon: Monitor },
        ].map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option.id as any)}
              className="flex w-full items-center gap-3 rounded-lg p-3 text-[var(--text)] hover:bg-[var(--surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <Icon className="size-5 text-[var(--text-muted)]" />
              <span className="font-medium">{option.label}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
