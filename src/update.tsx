import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { api, UpdateInfo } from "./api";
import { LuckButton, LuckDialog, LuckMeter } from "./luck";
import { fmtBytes } from "./format";

/**
 * Atualização sem reinstalar: ao abrir, o app procura uma versão nova em silêncio e, se houver, mostra o aviso
 * com as novidades. Com confirmação, baixa, confere a assinatura, instala e reinicia. Falha na procura (sem
 * internet, servidor fora) não incomoda ninguém: só fica sem aviso. Falha na instalação aparece no próprio aviso.
 */
export function UpdateControl() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const id = setTimeout(() => {
      api
        .updateCheck()
        .then((i) => {
          if (!alive) return;
          setInfo(i);
          if (i.available) setOpen(true);
        })
        .catch(() => {});
    }, 3000);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, []);

  const install = async () => {
    setError(null);
    setProgress({ done: 0, total: null });
    try {
      await api.updateInstall(setProgress);
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ""));
      setProgress(null);
    }
  };

  if (!info?.available) return null;
  const busy = progress != null;
  return (
    <>
      <LuckButton variant="primary" size="sm" fullWidth iconLeft={<Download size={14} />} onClick={() => setOpen(true)}>
        <span className="nav-label">Atualizar para {info.available}</span>
      </LuckButton>

      {/* No body: dentro da barra lateral o diálogo ficaria atrás do conteúdo. */}
      {createPortal(
        <LuckDialog
          open={open}
          persistent={busy}
          heading={`Bancada ${info.available}`}
          description={`Você está na ${info.current}. O app baixa a versão nova, confere a assinatura, instala e reinicia.`}
          onClose={() => !busy && setOpen(false)}
        >
          {info.notes && <Notes text={info.notes} />}
          {busy && (
            <LuckMeter
              label="Baixando a atualização"
              value={progress.total ? progress.done : 0}
              max={progress.total ?? 1}
              valueText={progress.total ? `${fmtBytes(progress.done)} de ${fmtBytes(progress.total)}` : "começando…"}
            />
          )}
          {error && (
            <p className="small" role="alert" style={{ margin: "0 0 14px", color: "var(--danger)" }}>
              {error} Nada foi alterado no app instalado.
            </p>
          )}
          <div className="row gap-sm end">
            <LuckButton variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Depois</LuckButton>
            <LuckButton variant="primary" loading={busy} onClick={install}>
              {busy ? "Atualizando…" : error ? "Tentar de novo" : "Atualizar e reiniciar"}
            </LuckButton>
          </div>
        </LuckDialog>,
        document.body,
      )}
    </>
  );
}

/** Número da versão instalada, no pé da barra lateral. Não usa rede. */
export function AppVersion() {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    api.appVersion().then(setV).catch(() => {});
  }, []);
  return v ? <span className="rail-version" title={`Bancada ${v}`}>v{v}</span> : null;
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
