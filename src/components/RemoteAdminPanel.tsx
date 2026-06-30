import { FaPowerOff, FaRotate } from "react-icons/fa6";
import { ConnectionQr } from "./ConnectionQr";
import type { RemoteServerDashboard } from "../types/remote";

type RemoteAdminPanelProps = {
  dashboard: RemoteServerDashboard | null;
  isLoading: boolean;
  onSetEnabled: (enabled: boolean) => void;
  onRefresh: () => void;
};

export function RemoteAdminPanel({
  dashboard,
  isLoading,
  onSetEnabled,
  onRefresh,
}: RemoteAdminPanelProps) {
  return (
    <section className="container remoteAdmin" aria-labelledby="remote-title">
      <div className="panelHeader">
        <div>
          <h3 id="remote-title">Controlo remoto</h3>
          <p>Servidor local simples para comandos Android, iPhone e Windows na rede interna.</p>
        </div>
        <div className={`serverBadge ${dashboard?.running ? "online" : "offline"}`}>
          {dashboard?.running ? "Online" : "Offline"}
        </div>
      </div>

      <div className="remoteGrid">
        <div className="remoteCard">
          <dl className="serverFacts">
            <div>
              <dt>Nome</dt>
              <dd>{dashboard?.deviceName ?? "Central"}</dd>
            </div>
            <div>
              <dt>Endereco da API</dt>
              <dd>{dashboard?.serverUrl ?? "Servidor desligado"}</dd>
            </div>
            <div>
              <dt>Porta</dt>
              <dd>{dashboard?.port ?? "-"}</dd>
            </div>
            <div>
              <dt>Clientes ligados</dt>
              <dd>{dashboard?.connectedClients ?? 0}</dd>
            </div>
          </dl>

          <div className="adminActions">
            <button
              type="button"
              className={`controlBtn ${dashboard?.enabled ? "stopRadioBtn" : "playRadioBtn"}`}
              onClick={() => onSetEnabled(!(dashboard?.enabled ?? false))}
              disabled={isLoading}
            >
              <FaPowerOff aria-hidden="true" />
              <span>{dashboard?.enabled ? "Desativar" : "Ativar"}</span>
            </button>
            <button type="button" className="controlBtn secondaryBtn" onClick={onRefresh}>
              <FaRotate aria-hidden="true" />
              <span>Atualizar</span>
            </button>
          </div>
        </div>

        <div className="remoteCard qrCard">
          <ConnectionQr value={dashboard?.serverUrl ?? null} />
          <p className="connectionUrl">
            {dashboard?.serverUrl ?? "Ative o servidor para gerar o endereco."}
          </p>
        </div>
      </div>

      <div>
        <h4>Ultimas acoes</h4>
        <div className="listBox">
          {dashboard?.actionLog.length ? (
            dashboard.actionLog.map((entry) => (
              <div className="listRow" key={entry.id}>
                <div>
                  <strong>{entry.action}</strong>
                  <span>
                    {entry.at} - {entry.source} - {entry.detail}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="emptyState">Sem registos.</p>
          )}
        </div>
      </div>
    </section>
  );
}
