"use client";
import * as React from "react";

type Theme = "light" | "dark" | "system";
const STORAGE_KEY = "smg.theme";

interface ThemeCtx {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const ThemeContext = React.createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("dark"); // dark-first per spec
  const [resolved, setResolved] = React.useState<"light" | "dark">("dark");

  // Load stored preference on mount
  React.useEffect(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) as Theme | null;
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
  }, []);

  // Apply theme class to <html>
  React.useEffect(() => {
    const root = document.documentElement;
    const applySystem = () =>
      window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const next = theme === "system" ? applySystem() : theme;
    setResolved(next);
    root.classList.toggle("dark", next === "dark");
    localStorage.setItem(STORAGE_KEY, theme);

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => {
        const n = mq.matches ? "dark" : "light";
        setResolved(n);
        root.classList.toggle("dark", n === "dark");
      };
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
