import { FaCog, FaPlay, FaVolumeMute, FaVolumeUp } from "react-icons/fa";
import { LuRadioTower, LuSiren } from "react-icons/lu";
import {
  ALERTS,
  RADIO_STATIONS,
  getAlertById,
  getRadioById,
  type AlertId,
  type RadioStationId,
} from "../config/catalog";
import type { CentralState } from "../types/remote";

type CentralPanelProps = {
  state: CentralState;
  onPlayAlert: (alertId: AlertId) => void;
  onStopAlert: () => void;
  onPlayRadio: (radioId?: RadioStationId) => void;
  onStopRadio: () => void;
  onVolumeChange: (volume: number) => void;
  onOpenSettings: () => void;
};

export function CentralPanel({
  state,
  onPlayAlert,
  onStopAlert,
  onPlayRadio,
  onStopRadio,
  onVolumeChange,
  onOpenSettings,
}: CentralPanelProps) {
  const activeAlert = state.activeAlert
    ? getAlertById(state.activeAlert)
    : null;
  const activeRadio = state.activeRadio
    ? getRadioById(state.activeRadio)
    : null;

  return (
    <>
      <div className="contentWrapper">
        <section
          className="container alertasWrapper"
          aria-labelledby="alerts-title"
        >
          <div className="alertasHeader">
            <LuSiren size={32} aria-hidden="true" />
            <h3 id="alerts-title">Alertas</h3>
          </div>
          <div className="statusLine">
            <span>Ativo:</span>
            <strong>{activeAlert?.label ?? "Nenhum"}</strong>
          </div>
          <div className="btnWrapper">
            {ALERTS.map((alert) => {
              const Icon = alert.icon;
              const isActive = state.activeAlert === alert.id;

              return (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => onPlayAlert(alert.id)}
                  className={`btnAlerta ${alert.className} ${isActive ? "active" : ""}`}
                  aria-pressed={isActive}
                >
                  <Icon size={60} aria-hidden="true" />
                  <span>{alert.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="container radiosWrapper"
          aria-labelledby="radios-title"
        >
          <div className="radiosHeader">
            <LuRadioTower size={32} aria-hidden="true" />
            <h3 id="radios-title">Radios</h3>
          </div>
          <div className="radioWrapper">
            {RADIO_STATIONS.map((station) => {
              const Icon = station.icon;
              const isActive =
                state.isRadioPlaying && state.activeRadio === station.id;

              return (
                <button
                  key={station.id}
                  type="button"
                  className={`btnAlerta radioButton ${isActive ? "active" : ""}`}
                  onClick={() => onPlayRadio(station.id)}
                  aria-pressed={isActive}
                >
                  <Icon size={60} aria-hidden="true" />
                  <span>{station.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <section
        className="container controlPanelWrapper"
        aria-label="Controlos principais"
      >
        {state.activeAlert ? (
          <button
            type="button"
            onClick={onStopAlert}
            className="controlBtn stopAlertBtn"
          >
            <LuSiren size={25} aria-hidden="true" />
            <span>Parar Alerta</span>
          </button>
        ) : null}

        {state.isRadioPlaying ? (
          <button
            type="button"
            onClick={onStopRadio}
            className="controlBtn stopRadioBtn"
          >
            <FaVolumeMute size={25} aria-hidden="true" />
            <span>Parar Radio</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onPlayRadio()}
            className="controlBtn playRadioBtn"
          >
            <FaPlay size={25} aria-hidden="true" />
            <span>Play Radio</span>
          </button>
        )}

        <label className="volumeControl" htmlFor="radioVolume">
          <FaVolumeUp size={25} aria-hidden="true" />
          <span className="srOnly">Volume da radio</span>
          <input
            id="radioVolume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={state.radioVolume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            className="volumeSlider"
          />
        </label>

        <div className="infoRadio">
          <span>A reproduzir:</span>
          <strong>
            {state.isRadioPlaying ? (activeRadio?.name ?? "Radio") : "Nenhum"}
          </strong>
        </div>

        <button
          type="button"
          className="controlBtn secondaryBtn settingsBtn"
          onClick={onOpenSettings}
        >
          <FaCog aria-hidden="true" />
          <span>Configuracoes</span>
        </button>
      </section>

      {state.lastError ? (
        <p className="errorBanner">{state.lastError}</p>
      ) : null}
    </>
  );
}
