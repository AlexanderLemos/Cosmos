import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Mirrors `DaemonStatus` in src-tauri/src/main.rs. */
type DaemonStatus =
  | { state: "running"; daemon_version: string; protocol_version: number; schema_version: number; pid: number; uptime_secs: number }
  | { state: "stopped"; endpoint: string }
  | { state: "error"; message: string };

const LABEL: Record<DaemonStatus["state"], string> = {
  running: "ativo",
  stopped: "parado",
  error: "erro",
};

export function App() {
  const [status, setStatus] = useState<DaemonStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await invoke<DaemonStatus>("daemon_status"));
    } catch (e) {
      setStatus({ state: "error", message: String(e) });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="shell">
      <header className="topbar">
        <span className="wordmark">COSMOS</span>
        <span className="phase">Fase 0 · Fundação</span>
      </header>

      <section className="card" aria-live="polite">
        <h1>
          Daímōn <span className="functional">· serviço local</span>
        </h1>
        {status === null ? (
          <p className="muted">Verificando…</p>
        ) : (
          <>
            <p className={`state state-${status.state}`}>
              <span className="dot" aria-hidden /> {LABEL[status.state]}
            </p>
            {status.state === "running" && (
              <dl className="facts">
                <dt>versão</dt>
                <dd>{status.daemon_version}</dd>
                <dt>protocolo</dt>
                <dd>v{status.protocol_version}</dd>
                <dt>schema</dt>
                <dd>v{status.schema_version}</dd>
                <dt>pid</dt>
                <dd>{status.pid}</dd>
              </dl>
            )}
            {status.state === "stopped" && (
              <p className="muted">
                Inicie com <code>cosmosd</code>. Endpoint: <code>{status.endpoint}</code>
              </p>
            )}
            {status.state === "error" && <p className="muted">{status.message}</p>}
          </>
        )}
        <button type="button" onClick={() => void refresh()}>
          Atualizar
        </button>
      </section>
    </main>
  );
}
