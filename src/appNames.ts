/**
 * Nomes amigáveis dos apps mais comuns. O adb não entrega o rótulo do app sem extrair o APK,
 * então mantemos este dicionário local; o que não estiver aqui cai no nome do pacote encurtado.
 */
const NAMES: Record<string, string> = {
  "android": "Sistema Android",
  "com.android.chrome": "Chrome",
  "com.android.vending": "Play Store",
  "com.amazon.mShop.android.shopping": "Amazon",
  "com.discord": "Discord",
  "com.facebook.katana": "Facebook",
  "com.facebook.orca": "Messenger",
  "com.google.android.apps.maps": "Google Maps",
  "com.google.android.apps.photos": "Google Fotos",
  "com.google.android.apps.messaging": "Mensagens",
  "com.google.android.calendar": "Google Agenda",
  "com.google.android.gm": "Gmail",
  "com.google.android.gms": "Google Play Services",
  "com.google.android.googlequicksearchbox": "Google",
  "com.google.android.projection.gearhead": "Android Auto",
  "com.google.android.youtube": "YouTube",
  "com.instagram.android": "Instagram",
  "com.linkedin.android": "LinkedIn",
  "com.mercadolibre": "Mercado Livre",
  "com.microsoft.teams": "Teams",
  "com.netflix.mediaclient": "Netflix",
  "com.nu.production": "Nubank",
  "com.nubank.android": "Nubank",
  "com.picpay": "PicPay",
  "com.samsung.android.app.watchmanager": "Galaxy Wearable",
  "com.samsung.android.lool": "Assistência do aparelho",
  "com.samsung.android.honeyboard": "Teclado Samsung",
  "com.samsung.android.scloud": "Samsung Cloud",
  "com.sec.android.app.launcher": "One UI Home",
  "com.sec.android.app.samsungapps": "Galaxy Store",
  "com.spotify.music": "Spotify",
  "com.twitter.android": "X",
  "com.ubercab": "Uber",
  "com.whatsapp": "WhatsApp",
  "com.whatsapp.w4b": "WhatsApp Business",
  "com.x8bit.bitwarden": "Bitwarden",
  "com.zhiliaoapp.musically": "TikTok",
  "br.com.brainweb.ifood": "iFood",
  "org.telegram.messenger": "Telegram",
  "org.thoughtcrime.securesms": "Signal",
};

const shorten = (p: string) => {
  const parts = p.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : p;
};

/**
 * Nomes reais lidos do APK (catálogo local, ver `collectors::app_meta`). Chegam aos poucos, conforme os
 * ícones são extraídos; quem desenha nomes é avisado para redesenhar.
 */
const LEARNED = new Map<string, string>();
const listeners = new Set<() => void>();
let pending: ReturnType<typeof setTimeout> | undefined;

export function learnLabels(m: Record<string, string>) {
  let changed = false;
  for (const [pkg, label] of Object.entries(m)) {
    if (label && LEARNED.get(pkg) !== label) {
      LEARNED.set(pkg, label);
      changed = true;
    }
  }
  if (changed && !pending) pending = setTimeout(() => { pending = undefined; listeners.forEach((f) => f()); }, 300);
}

export function onLabels(f: () => void) {
  listeners.add(f);
  return () => { listeners.delete(f); };
}

/** Nome para mostrar: o do celular, senão o dicionário, senão o pacote encurtado. Aceita nome de processo (`pkg:servico`). */
export function appLabel(pkgOrProc: string): string {
  const pkg = pkgOrProc.split(/\s+/)[0].split(":")[0];
  return LEARNED.get(pkg) ?? NAMES[pkg] ?? shorten(pkg);
}

export const hasFriendlyName = (pkg: string) => LEARNED.has(pkg) || pkg in NAMES;

const INSTALLERS: Record<string, string> = {
  "com.android.vending": "Play Store",
  "com.sec.android.app.samsungapps": "Galaxy Store",
  "com.samsung.android.scloud": "Samsung Cloud (restaurado)",
  "com.android.chrome": "Chrome (download)",
  "com.google.android.packageinstaller": "Instalador de pacotes",
};
export const installerLabel = (i?: string | null) => (i ? INSTALLERS[i] ?? i : "desconhecido");
