import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaPlay, FaVolumeMute, FaVolumeUp } from "react-icons/fa";
import { LuSiren } from "react-icons/lu";
import type { CentralState, RemoteCatalog } from "../types/remote";
import { DEFAULT_CENTRAL_STATE } from "../types/remote";

type SavedRemoteConfig = {
  serverUrl: string;
  serverName: string;
};

type HealthResponse = {
  ok: boolean;
  serverName: string;
  port: number;
};

const STORAGE_KEY = "central.remote.config";

export function MobileRemoteApp() {
  const [config, setConfig] = useState<SavedRemoteConfig | null>(() => loadConfig());
  const [serverUrl, setServerUrl] = useState(() => config?.serverUrl ?? getServerUrlFromLocation());
  const [catalog, setCatalog] = useState<RemoteCatalog>({ alerts: [], radios: [] });
  const [state, setState] = useState<CentralState>(DEFAULT_CENTRAL_STATE);
  const [connection, setConnection] = useState<"offline" | "connecting" | "online">("offline");
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAlert, setPendingAlert] = useState<RemoteCatalog["alerts"][number] | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  const normalizedServerUrl = useMemo(() => normalizeServerUrl(serverUrl), [serverUrl]);

  const remoteFetch = useCallback(
    async <T,>(path: string, options?: RequestInit): Promise<T> => {
      if (!config) {
        throw new Error("Configure o endereco da central.");
      }

      return apiFetch<T>(config.serverUrl, path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options?.headers ?? {}),
        },
      });
    },
    [config],
  );

  const refresh = useCallback(async () => {
    if (!config) {
      return;
    }

    try {
      setConnection("connecting");
      const [nextCatalog, nextState] = await Promise.all([
        remoteFetch<RemoteCatalog>("/api/catalog"),
        remoteFetch<CentralState>("/api/state"),
      ]);
      setCatalog(nextCatalog);
      setState(nextState);
      setConnection("online");
      setMessage(null);
    } catch (error) {
      setConnection("offline");
      setMessage(error instanceof Error ? error.message : "Servidor indisponivel.");
    }
  }, [remoteFetch, config]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!config) {
      return;
    }
    const activeConfig = config;

    function connect() {
      setConnection("connecting");
      const socket = new WebSocket(toWebSocketUrl(activeConfig.serverUrl));

      socket.onopen = () => {
        setConnection("online");
        setMessage(null);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "state") {
            setState(payload.state);
          }
        } catch (error) {
          console.error("Mensagem WebSocket invalida:", error);
        }
      };

      socket.onerror = () => {
        setConnection("offline");
      };

      socket.onclose = () => {
        setConnection("offline");
        reconnectTimer.current = window.setTimeout(connect, 2500);
      };

      return socket;
    }

    const socket = connect();

    return () => {
      if (reconnectTimer.current) {
        window.clearTimeout(reconnectTimer.current);
      }
      socket.close();
    };
  }, [config]);

  async function connectToCentral() {
    try {
      setMessage(null);
      setConnection("connecting");
      const health = await apiFetch<HealthResponse>(normalizedServerUrl, "/api/health");
      const nextConfig = {
        serverUrl: normalizedServerUrl,
        serverName: health.serverName,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
      setConfig(nextConfig);
      setMessage("Ligado a central.");
    } catch (error) {
      setConnection("offline");
      setMessage(error instanceof Error ? error.message : "Nao foi possivel ligar a central.");
    }
  }

  async function sendCommand(path: string, body?: unknown) {
    try {
      setMessage("Comando enviado.");
      await remoteFetch(path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro ao enviar comando.");
    }
  }

  function forgetConfig() {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(null);
    setConnection("offline");
  }

  const activeAlert = catalog.alerts.find((alert) => alert.id === state.activeAlert);
  const activeRadio = catalog.radios.find((radio) => radio.id === state.activeRadio);

  if (!config) {
    return (
      <main className="mobileShell">
        <section className="mobilePanel">
          <h1>Comando da Central</h1>
          <p className="mobileHint">Introduza o endereco mostrado no computador da central.</p>
          <label>
            Endereco da central
            <input
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="http://192.168.1.20:8787"
              inputMode="url"
            />
          </label>
          <button type="button" className="mobilePrimaryBtn" onClick={connectToCentral}>
            Ligar a central
          </button>
          {message ? <p className="mobileMessage">{message}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className="mobileShell">
      <header className="mobileTopbar">
        <div>
          <span className={`connectionDot ${connection}`} aria-hidden="true" />
          <strong>{connection === "online" ? "Ligado" : connection === "connecting" ? "A ligar" : "Sem ligacao"}</strong>
        </div>
        <button type="button" onClick={forgetConfig}>
          Alterar
        </button>
      </header>

      <section className="mobileStatus">
        <span>{config.serverName}</span>
        <strong>{activeAlert?.label ?? "Sem alerta ativo"}</strong>
      </section>

      {message ? <p className="mobileMessage">{message}</p> : null}

      <section className="mobileSection" aria-labelledby="mobile-alerts-title">
        <h2 id="mobile-alerts-title">
          <LuSiren aria-hidden="true" /> Alertas
        </h2>
        <div className="mobileAlertGrid">
          {catalog.alerts.map((alert) => (
            <button
              type="button"
              key={alert.id}
              className={state.activeAlert === alert.id ? "active" : ""}
              onClick={() => setPendingAlert(alert)}
            >
              {alert.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="mobileStopBtn"
          disabled={!state.activeAlert}
          onClick={() => void sendCommand("/api/alerts/stop")}
        >
          Parar alerta
        </button>
      </section>

      <section className="mobileSection" aria-labelledby="mobile-radio-title">
        <h2 id="mobile-radio-title">Radio</h2>
        <div className="mobileRadioList">
          {catalog.radios.map((radio) => (
            <button
              key={radio.id}
              type="button"
              className={state.isRadioPlaying && state.activeRadio === radio.id ? "active" : ""}
              onClick={() => void sendCommand(`/api/radio/stations/${radio.id}`)}
            >
              <FaPlay aria-hidden="true" />
              {radio.name}
            </button>
          ))}
        </div>
        <div className="mobileRadioControls">
          <button type="button" onClick={() => void sendCommand("/api/radio/play")}>
            <FaPlay aria-hidden="true" />
            Retomar
          </button>
          <button type="button" onClick={() => void sendCommand("/api/radio/stop")}>
            <FaVolumeMute aria-hidden="true" />
            Parar
          </button>
        </div>
        <label className="mobileVolume">
          <FaVolumeUp aria-hidden="true" />
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.radioVolume}
            onChange={(event) => {
              const volume = Number(event.target.value);
              setState((current) => ({ ...current, radioVolume: volume }));
              void sendCommand("/api/radio/volume", { volume });
            }}
          />
        </label>
        <p className="mobileHint">Radio atual: {state.isRadioPlaying ? activeRadio?.name ?? "Radio" : "Nenhuma"}</p>
      </section>

      {pendingAlert ? (
        <div className="confirmOverlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="confirmDialog">
            <h2 id="confirm-title">Iniciar alerta?</h2>
            <p>{pendingAlert.label}</p>
            <div>
              <button type="button" onClick={() => setPendingAlert(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="mobileStopBtn"
                onClick={() => {
                  void sendCommand(`/api/alerts/${pendingAlert.id}/play`);
                  setPendingAlert(null);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function loadConfig(): SavedRemoteConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedRemoteConfig) : null;
  } catch {
    return null;
  }
}

function normalizeServerUrl(value: string) {
  const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

function getServerUrlFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return params.get("server") ?? "http://";
}

function toWebSocketUrl(serverUrl: string) {
  const url = new URL(serverUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  return url.toString();
}

async function apiFetch<T>(serverUrl: string, path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${normalizeServerUrl(serverUrl)}${path}`, options);

  if (!response.ok) {
    let detail = `Pedido falhou (${response.status}).`;
    try {
      const payload = await response.json();
      detail = payload.error ?? detail;
    } catch {
      // Keep default detail.
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}
