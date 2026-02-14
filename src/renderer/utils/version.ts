/**
 * Application version, read from package.json at build time.
 * Vite injects this via define config or import.meta.
 */

// Electron exposes the app version via the process object in renderer.
// In the packaged app, app.getVersion() returns the package.json version.
// For the renderer, we read it from the preload-exposed API or fall back.
export const APP_VERSION: string = (() => {
  try {
    // The preload script exposes app info on window.vyotiq
    const w = window as unknown as Record<string, unknown>;
    const vyotiq = w.vyotiq as Record<string, unknown> | undefined;
    const ver = vyotiq?.appVersion;
    if (typeof ver === 'string' && ver) return ver;
  } catch {
    // Not available in non-electron context
  }
  // Fallback: use import.meta.env if set by Vite define
  try {
    const meta = import.meta as unknown as { env?: Record<string, string> };
    const envVer = meta.env?.VITE_APP_VERSION;
    if (typeof envVer === 'string' && envVer) return envVer;
  } catch {
    // Not available
  }
  return '1.6.0';
})();
