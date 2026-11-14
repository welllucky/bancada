import type { Recommendation } from "./api";
import { actionPackage } from "./actions";
import type { Severity } from "./luck";

export type RecGroup = "energia" | "config" | "manutencao" | "seguranca";

export const GROUP_LABEL: Record<RecGroup, string> = {
  energia: "Bateria e energia",
  config: "Configurações",
  manutencao: "Manutenção",
  seguranca: "Segurança",
};

const CONFIG = new Set(["screen-timeout", "aod", "wifi-scan", "ble-scan", "mobile-always-on", "animations"]);
const MAINT = new Set(["storage-full", "trim-caches", "dexopt"]);
const SEC = new Set(["adb-on", "non-store"]);

/** Tema da recomendação pelo `id` estável do otimizador. */
export function groupOf(r: Recommendation): RecGroup {
  if (CONFIG.has(r.id)) return "config";
  if (MAINT.has(r.id)) return "manutencao";
  if (SEC.has(r.id)) return "seguranca";
  return "energia";
}

export const toneOf = (s: Recommendation["severity"]): Severity => (s === "critical" ? "danger" : s === "warn" ? "warning" : "neutral");
export const SEV_LABEL = { critical: "crítico", warn: "atenção", info: "sugestão" } as const;

/** App a que a recomendação se refere: o da ação, ou o pacote no id `cpu-asleep-<pkg>`. */
export function recPackage(r: Recommendation): string | undefined {
  return actionPackage(r.action) ?? (r.id.startsWith("cpu-asleep-") ? r.id.slice("cpu-asleep-".length) : undefined);
}

/** Recomendações que pedem atenção (sugestões e o que já foi corrigido ficam fora da contagem do veredito). */
export const problems = (rs: Recommendation[]) => rs.filter((r) => r.severity !== "info" && !r.resolved);

/** Título com o nome amigável do app no lugar do pacote. */
export function recTitle(r: Recommendation, label: (pkg: string) => string): string {
  const pkg = recPackage(r);
  return pkg && r.title.includes(pkg) ? r.title.replace(pkg, label(pkg)) : r.title;
}
