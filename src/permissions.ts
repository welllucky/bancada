/**
 * Nomes legíveis de permissões (`android.permission.*`) e operações do appops, em pt-BR.
 * O que não estiver aqui vira o próprio código em minúsculas, com espaços.
 */
const NAMES: Record<string, string> = {
  // permissões perigosas (DANGEROUS em collectors.rs)
  CAMERA: "Câmera",
  RECORD_AUDIO: "Microfone",
  ACCESS_FINE_LOCATION: "Localização precisa",
  ACCESS_COARSE_LOCATION: "Localização aproximada",
  ACCESS_BACKGROUND_LOCATION: "Localização em segundo plano",
  READ_CONTACTS: "Ler contatos",
  READ_SMS: "Ler SMS",
  RECEIVE_SMS: "Receber SMS",
  SEND_SMS: "Enviar SMS",
  READ_CALL_LOG: "Ler registro de chamadas",
  READ_PHONE_STATE: "Estado do telefone",
  CALL_PHONE: "Fazer ligações",
  BODY_SENSORS: "Sensores corporais",
  READ_MEDIA_IMAGES: "Ler fotos",
  READ_MEDIA_VIDEO: "Ler vídeos",
  READ_EXTERNAL_STORAGE: "Ler armazenamento",
  POST_NOTIFICATIONS: "Enviar notificações",
  BLUETOOTH_SCAN: "Procurar dispositivos Bluetooth",
  BLUETOOTH_CONNECT: "Conectar a dispositivos Bluetooth",
  NEARBY_WIFI_DEVICES: "Dispositivos Wi-Fi próximos",
  // operações do appops
  FINE_LOCATION: "Localização precisa",
  COARSE_LOCATION: "Localização aproximada",
  GPS: "GPS",
  MONITOR_LOCATION: "Acompanhar localização",
  MONITOR_HIGH_POWER_LOCATION: "Localização de alto consumo",
  VIBRATE: "Vibrar",
  WIFI_SCAN: "Procurar redes Wi-Fi",
  CHANGE_WIFI_STATE: "Ligar ou desligar o Wi-Fi",
  WAKE_LOCK: "Manter o aparelho acordado",
  TOAST_WINDOW: "Mensagens rápidas na tela",
  SYSTEM_ALERT_WINDOW: "Sobrepor a outros apps",
  ACCESS_LOCAL_NETWORK: "Rede local",
  READ_CLIPBOARD: "Ler a área de transferência",
  WRITE_CLIPBOARD: "Copiar para a área de transferência",
  READ_EXTERNAL_STORAGE_OP: "Ler armazenamento",
  WRITE_EXTERNAL_STORAGE: "Gravar no armazenamento",
  READ_MEDIA_AUDIO: "Ler áudios",
  READ_MEDIA_VISUAL_USER_SELECTED: "Fotos e vídeos escolhidos",
  TAKE_AUDIO_FOCUS: "Tocar áudio",
  PLAY_AUDIO: "Tocar áudio",
  AUDIO_MEDIA_VOLUME: "Volume de mídia",
  RUN_IN_BACKGROUND: "Rodar em segundo plano",
  RUN_ANY_IN_BACKGROUND: "Rodar em segundo plano",
  START_FOREGROUND: "Serviço em primeiro plano",
  SCHEDULE_EXACT_ALARM: "Alarmes exatos",
  GET_USAGE_STATS: "Acesso ao uso",
  POST_NOTIFICATION: "Enviar notificações",
  USE_BIOMETRIC: "Biometria",
  USE_FINGERPRINT: "Impressão digital",
  READ_CONTACTS_OP: "Ler contatos",
  READ_PHONE_NUMBERS: "Número de telefone",
  BLUETOOTH_ADVERTISE: "Anunciar via Bluetooth",
  UWB_RANGING: "Banda ultralarga",
  ACTIVITY_RECOGNITION: "Reconhecer atividade física",
  NEARBY_WIFI_DEVICES_OP: "Dispositivos Wi-Fi próximos",
  ESTABLISH_VPN_SERVICE: "Criar VPN",
  REQUEST_INSTALL_PACKAGES: "Instalar apps",
  MANAGE_EXTERNAL_STORAGE: "Todos os arquivos",
  PICTURE_IN_PICTURE: "Picture-in-picture",
  INTERACT_ACROSS_PROFILES: "Usar outros perfis",
  MUTE_MICROPHONE: "Silenciar microfone",
  RECEIVE_EXPLICIT_USER_INTERACTION_AUDIO: "Áudio de interação",
};

/** Nome legível de uma permissão ou operação; aceita com ou sem `android.permission.`. */
export function permLabel(code: string): string {
  const c = code.replace(/^android\.permission\./, "");
  if (NAMES[c]) return NAMES[c];
  const s = c.toLowerCase().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Tempo do appops (`2h31m34s781ms`, `6d7h38m4s811ms`) só com dias, horas e minutos:
 * "2 h 31 min", "6 d 7 h 38 min", "menos de 1 min".
 */
export function fmtAgo(raw: string): string {
  const n = (u: string) => Number(raw.match(new RegExp(`(\\d+)${u}(?![a-z])`))?.[1] ?? 0);
  const d = n("d"), h = n("h"), m = n("m");
  if (!d && !h && !m) return /\d/.test(raw) ? "há menos de 1 min" : raw;
  const parts = [d && `${d} d`, h && `${h} h`, m && `${m} min`].filter(Boolean);
  return `há ${parts.join(" ")}`;
}
