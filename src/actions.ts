import type { Action } from "./api";

/** Comando exato enviado ao `adb shell` (mesmos tokens de `Action::to_tokens` no core). */
export function command(a: Action): string {
  switch (a.kind) {
    case "set_setting": return `settings put ${a.namespace} ${a.key} ${a.value}`;
    case "force_stop": return `am force-stop ${a.package}`;
    case "set_standby_bucket": return `am set-standby-bucket ${a.package} ${a.bucket}`;
    case "set_background": return `cmd appops set ${a.package} RUN_ANY_IN_BACKGROUND ${a.mode}`;
    case "trim_caches": return "pm trim-caches 999G";
    case "bg_dexopt": return "cmd package bg-dexopt-job";
    case "reboot": return "reboot";
    case "uninstall_user_app": return `pm uninstall --user 0 ${a.package}`;
  }
}

/** Texto gravado no registro de ações (espelha `Action::describe` no core). */
export function logLabel(a: Action): string {
  switch (a.kind) {
    case "set_setting": return `settings put ${a.namespace} ${a.key} ${a.value}`;
    case "force_stop": return `forçar parada de ${a.package}`;
    case "set_standby_bucket": return `bucket de ${a.package} → ${a.bucket}`;
    case "set_background": return `segundo plano de ${a.package} → ${a.mode}`;
    case "trim_caches": return "limpar cache de todos os apps";
    case "bg_dexopt": return "otimizar (dexopt) apps";
    case "reboot": return "reiniciar";
    case "uninstall_user_app": return `desinstalar ${a.package} (usuário 0)`;
  }
}

/** Se a ação pode ser desfeita e como, mostrado no diálogo de confirmação. */
export function reversal(a: Action): { reversible: boolean; text: string } {
  switch (a.kind) {
    case "set_setting": return { reversible: true, text: "Reversível: a configuração pode voltar ao valor anterior." };
    case "force_stop": return { reversible: true, text: "Nada a desfazer: o app volta a abrir normalmente quando você usar." };
    case "set_standby_bucket": return { reversible: true, text: "Reversível: escolha outra frequência no detalhe do app." };
    case "set_background": return { reversible: true, text: "Reversível: permita o segundo plano de novo no detalhe do app." };
    case "trim_caches": return { reversible: true, text: "Nada a desfazer: só remove arquivos temporários, que os apps recriam." };
    case "bg_dexopt": return { reversible: true, text: "Nada a desfazer: só conclui a compilação de apps." };
    case "reboot": return { reversible: true, text: "A conexão cai até o aparelho voltar." };
    case "uninstall_user_app": return { reversible: false, text: "Irreversível: os dados do app neste usuário são apagados." };
  }
}

/** Pacote afetado pela ação, quando houver. */
export const actionPackage = (a?: Action): string | undefined =>
  a && "package" in a ? a.package : undefined;
