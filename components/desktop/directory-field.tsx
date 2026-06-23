"use client";

// DirectoryField: a path text input paired with a native "Browse…" folder picker.
//
// Inside the desktop shell the Browse button opens the OS folder dialog
// (window.athena.app.pickDirectory) so the user never has to hand-type an absolute path; the
// text input remains as a fallback for pasting a known path. On the web build (no bridge) the
// button is hidden and it degrades to a plain input. Styling mirrors the inline-style idiom of
// the local desktop surfaces (workspaces-view) so it drops in without a restyle.

import { useCallback, useState } from "react";
import { FolderOpen } from "lucide-react";

import { athena, isDesktop } from "@/lib/desktop/bridge";

interface DirectoryFieldProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

export function DirectoryField({
  value,
  onChange,
  placeholder,
  disabled,
  "aria-label": ariaLabel,
}: DirectoryFieldProps) {
  const [picking, setPicking] = useState(false);

  const browse = useCallback(async () => {
    if (!isDesktop) return;
    setPicking(true);
    try {
      const picked = await athena.app.pickDirectory(value.trim() || undefined);
      if (picked) onChange(picked);
    } catch {
      /* user cancelled or the dialog failed; keep the typed value */
    } finally {
      setPicking(false);
    }
  }, [value, onChange]);

  return (
    <div style={wrapStyle}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        disabled={disabled}
        aria-label={ariaLabel}
        style={inputStyle}
      />
      {isDesktop ? (
        <button
          type="button"
          onClick={() => void browse()}
          disabled={disabled || picking}
          style={browseButtonStyle(Boolean(disabled) || picking)}
          title="Choose a folder"
        >
          <FolderOpen size={14} aria-hidden="true" />
          Browse…
        </button>
      ) : null}
    </div>
  );
}

const wrapStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.375rem",
  flex: 1,
  minWidth: 0,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: "2rem",
  padding: "0 0.5rem",
  borderRadius: "6px",
  border: "1px solid var(--border)",
  background: "var(--bg)",
  color: "var(--text)",
  font: "inherit",
  fontSize: "0.8125rem",
};

function browseButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    height: "2rem",
    padding: "0 0.625rem",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    background: "var(--surface)",
    color: "var(--text)",
    font: "inherit",
    fontSize: "0.8125rem",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    flex: "none",
    whiteSpace: "nowrap",
  };
}
