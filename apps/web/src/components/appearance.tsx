import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
export function Appearance() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("river-appearance", next ? "dark" : "light");
    } catch {
      // The toggle still works for this page when the browser cannot persist preferences.
    }
  }
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "Use light appearance" : "Use dark appearance"}
      onClick={toggle}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
