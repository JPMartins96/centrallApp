import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_RADIO_ID, type AlertId, type RadioStationId } from "../config/catalog";
import { CentralAudioService } from "../services/centralAudio";
import {
  DEFAULT_CENTRAL_STATE,
  type CentralState,
  type RemoteCommand,
  type RemoteServerDashboard,
} from "../types/remote";

function hasTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export function useCentralController() {
  const [state, setState] = useState<CentralState>(DEFAULT_CENTRAL_STATE);
  const [dashboard, setDashboard] = useState<RemoteServerDashboard | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const serviceRef = useRef<CentralAudioService | null>(null);
  const stateRef = useRef(state);
  const isTauri = hasTauriRuntime();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  if (!serviceRef.current) {
    serviceRef.current = new CentralAudioService(setState);
  }

  const service = serviceRef.current;

  const refreshDashboard = useCallback(async () => {
    if (!isTauri) {
      return;
    }

    setIsDashboardLoading(true);
    try {
      const nextDashboard = await invoke<RemoteServerDashboard>(
        "remote_get_dashboard",
      );
      setDashboard(nextDashboard);
    } catch (error) {
      console.error("Erro ao obter estado do servidor remoto:", error);
    } finally {
      setIsDashboardLoading(false);
    }
  }, [isTauri]);

  const pushStateToBackend = useCallback(
    async (nextState: CentralState) => {
      if (!isTauri) {
        return;
      }

      try {
        await invoke("remote_update_central_state", { state: nextState });
      } catch (error) {
        console.error("Erro ao sincronizar estado com servidor:", error);
      }
    },
    [isTauri],
  );

  useEffect(() => {
    void pushStateToBackend(state);
  }, [pushStateToBackend, state]);

  useEffect(() => {
    void refreshDashboard();

    if (!isTauri) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshDashboard();
    }, 5000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isTauri, refreshDashboard]);

  useEffect(() => {
    if (!isTauri) {
      return;
    }

    let unlisten: (() => void) | undefined;

    void listen<RemoteCommand>("remote-command", async (event) => {
      const command = event.payload;

      switch (command.type) {
        case "play_alert":
          await service.playAlert(command.alertId);
          break;
        case "stop_alert":
          service.stopAlert(true);
          break;
        case "play_radio":
          await service.playRadio(command.radioId ?? stateRef.current.activeRadio ?? DEFAULT_RADIO_ID);
          break;
        case "stop_radio":
          service.stopRadio();
          break;
        case "set_radio_volume":
          service.setRadioVolume(command.volume);
          break;
      }

      await pushStateToBackend(service.getState());
      await refreshDashboard();
    }).then((cleanup) => {
      unlisten = cleanup;
    });

    return () => {
      unlisten?.();
    };
  }, [isTauri, pushStateToBackend, refreshDashboard, service]);

  useEffect(() => {
    return () => {
      service.destroy();
    };
  }, [service]);

  const actions = useMemo(
    () => ({
      playAlert: async (alertId: AlertId) => {
        await service.playAlert(alertId);
        await invokeLocalAction(isTauri, "play_alert", alertId);
      },
      stopAlert: async () => {
        service.stopAlert(true);
        await invokeLocalAction(isTauri, "stop_alert", "local");
      },
      playRadio: async (radioId?: RadioStationId) => {
        await service.playRadio(radioId);
        await invokeLocalAction(isTauri, "play_radio", radioId ?? "selected");
      },
      stopRadio: async () => {
        service.stopRadio();
        await invokeLocalAction(isTauri, "stop_radio", "local");
      },
      setRadioVolume: async (volume: number) => {
        service.setRadioVolume(volume);
        await invokeLocalAction(isTauri, "set_radio_volume", String(volume));
      },
      setRemoteEnabled: async (enabled: boolean) => {
        if (!isTauri) {
          return;
        }

        await invoke("remote_set_enabled", { enabled });
        await refreshDashboard();
      },
      refreshDashboard,
    }),
    [isTauri, refreshDashboard, service],
  );

  return {
    state,
    dashboard,
    isDashboardLoading,
    actions,
  };
}

async function invokeLocalAction(isTauri: boolean, action: string, detail: string) {
  if (!isTauri) {
    return;
  }

  try {
    await invoke("remote_record_local_action", { action, detail });
  } catch (error) {
    console.error("Erro ao registar acao local:", error);
  }
}
