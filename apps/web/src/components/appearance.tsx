import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
export function Appearance() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const next = localStorage.getItem("river-appearance") === "dark";
    document.documentElement.classList.toggle("dark", next);
    setDark(next);
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("river-appearance", next ? "dark" : "light");
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
