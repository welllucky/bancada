import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, RefreshCw } from "lucide-react";
import { api, UpdateInfo } from "./api";
import { useLocal } from "./hooks";
import { LuckButton, LuckDialog, LuckMeter, LuckSwitch } from "./luck";
import { fmtBytes } from "./format";

/**
 * Versão do app e atualização sem reinstalar: procura ao abrir (se a pessoa deixar), mostra as novidades e,
 * com confirmação, baixa, confere a assinatura, instala e reinicia.
 */
export function UpdateControl({ toast }: { toast: (m: string, k?: "ok" | "err") => void }) {
  const [auto, setAuto] = useLocal<boolean>("pd.autoUpdate", true);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number | null } | null>(null);

  const check = async (manual: boolean) => {
    setChecking(true);
    try {
      const i = await api.updateCheck();
      setInfo(i);
      if (manual) {
        if (!i.configured) toast("Esta versão foi compilada sem atualização automática.", "err");
        else if (!i.available) toast(`Você já está na versão mais nova (${i.current}).`, "ok");
        else setOpen(true);
      }
    } catch (e) {
      if (manual) toast(`Não foi possível procurar atualização: ${e}`, "err");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (!auto) {
      // Sem procurar na rede: só a versão instalada, para mostrar no rodapé.
      api.appVersion().then((current) => setInfo({ current, available: null, notes: null, date: null, configured: true })).catch(() => {});
      return;
    }
    const id = setTimeout(() => check(false), 3000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const install = async () => {
    setProgress({ done: 0, total: null });
    try {
      await api.updateInstall(setProgress);
    } catch (e) {
      toast(`A atualização não foi instalada: ${e}`, "err");
      setProgress(null);
    }
  };

  const busy = progress != null;
  return (
    <>
      {info?.available ? (
        <LuckButton variant="primary" size="sm" fullWidth iconLeft={<Download size={14} />} onClick={() => setOpen(true)}>
          <span className="nav-label">Atualizar para {info.available}</span>
        </LuckButton>
      ) : (
        <LuckButton variant="ghost" size="sm" fullWidth iconLeft={<RefreshCw size={14} className={checking ? "l-spin" : undefined} />} disabled={checking} onClick={() => check(true)}>
          <span className="nav-label">{info ? `Versão ${info.current}` : "Procurar atualização"}</span>
        </LuckButton>
      )}

      {/* No body: dentro da barra lateral o diálogo ficaria atrás do conteúdo. */}
      {createPortal(
      <LuckDialog
        open={open}
        persistent={busy}
        heading={info?.available ? `Phone Deck ${info.available}` : "Atualização"}
        description={info?.available ? `Você está na ${info.current}. O app baixa a versão nova, confere a assinatura, instala e reinicia.` : undefined}
        onClose={() => !busy && setOpen(false)}
      >
        {info?.notes && <Notes text={info.notes} />}
        {busy ? (
          <LuckMeter
            label="Baixando a atualização"
            value={progress.total ? progress.done : 0}
            max={progress.total ?? 1}
            valueText={progress.total ? `${fmtBytes(progress.done)} de ${fmtBytes(progress.total)}` : "começando…"}
          />
        ) : (
          <label className="row between gap-md" style={{ marginBottom: 14 }}>
            <span className="small">Procurar atualizações ao abrir o app</span>
            <LuckSwitch checked={auto} label="Procurar atualizações ao abrir o app" onChange={setAuto} />
          </label>
        )}
        <div className="row gap-sm end">
          <LuckButton variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Depois</LuckButton>
          <LuckButton variant="primary" loading={busy} onClick={install}>{busy ? "Atualizando…" : "Atualizar e reiniciar"}</LuckButton>
        </div>
      </LuckDialog>,
      document.body,
      )}
    </>
  );
}

/** Notas da release (Markdown simples gerado pelo pipeline: `### Seção` e `- item — hash`). */
function Notes({ text }: { text: string }) {
  const blocks: { title: string; items: string[] }[] = [];
  for (const line of text.split("\n")) {
    const h = line.match(/^#{1,4}\s+(.*)/);
    if (h) blocks.push({ title: h[1], items: [] });
    else if (/^\s*[-*]\s+/.test(line)) {
      if (!blocks.length) blocks.push({ title: "", items: [] });
      blocks[blocks.length - 1].items.push(line.replace(/^\s*[-*]\s+/, "").replace(/\s+—\s+[0-9a-f]{7}$/, ""));
    }
  }
  return (
    <div className="update-notes">
      {blocks.map((b, i) => (
        <div key={i}>
          {b.title && <span className="label">{b.title}</span>}
          <ul>{b.items.map((it, j) => <li key={j}>{it}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}
