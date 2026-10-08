/** Static text keeps the server and client script identical during hydration. */
export const appearanceBootstrap = `
(() => {
  try {
    document.documentElement.classList.toggle(
      "dark",
      localStorage.getItem("river-appearance") === "dark"
    );
  } catch {
    // Keep the default appearance when storage is unavailable.
  }
})();`;
