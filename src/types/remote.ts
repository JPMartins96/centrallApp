import type { AlertId, RadioStationId } from "../config/catalog";

export type CentralState = {
  activeAlert: AlertId | null;
  activeRadio: RadioStationId | null;
  isRadioPlaying: boolean;
  radioVolume: number;
  lastError: string | null;
};

export type RemoteCommand =
  | { id: string; type: "play_alert"; alertId: AlertId; source: string }
  | { id: string; type: "stop_alert"; source: string }
  | { id: string; type: "play_radio"; radioId?: RadioStationId; source: string }
  | { id: string; type: "stop_radio"; source: string }
  | {
      id: string;
      type: "set_radio_volume";
      volume: number;
      source: string;
    };

export type ActionLogEntry = {
  id: string;
  at: string;
  source: string;
  action: string;
  detail: string;
};

export type RemoteServerDashboard = {
  enabled: boolean;
  running: boolean;
  deviceName: string;
  localIp: string | null;
  port: number;
  serverUrl: string | null;
  connectedClients: number;
  actionLog: ActionLogEntry[];
  state: CentralState;
};

export type RemoteCatalog = {
  alerts: Array<{ id: AlertId; label: string }>;
  radios: Array<{ id: RadioStationId; name: string }>;
};

export const DEFAULT_CENTRAL_STATE: CentralState = {
  activeAlert: null,
  activeRadio: null,
  isRadioPlaying: false,
  radioVolume: 1,
  lastError: null,
};
