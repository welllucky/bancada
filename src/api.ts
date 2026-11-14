import type { DeviceApi } from "./device/port";
import { mockAdapter } from "./device/mock";
import { tauriAdapter } from "./device/tauri";

export * from "./device/types";
export type { DeviceApi } from "./device/port";

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Fora do app nativo (navegador, `pnpm dev`) a UI roda com dados de demonstração. */
export const api: DeviceApi = isTauri() ? tauriAdapter : mockAdapter;
