import {
  DEFAULT_RADIO_ID,
  getAlertById,
  getRadioById,
  type AlertId,
  type RadioStationId,
} from "../config/catalog";
import type { CentralState } from "../types/remote";

type StateListener = (state: CentralState) => void;

export class CentralAudioService {
  private alertAudio: HTMLAudioElement | null = null;
  private radioAudio: HTMLAudioElement | null = null;
  private currentAlert: AlertId | null = null;
  private currentRadio: RadioStationId | null = DEFAULT_RADIO_ID;
  private isRadioPlaying = false;
  private radioVolume = 0.99;
  private lastError: string | null = null;
  private lastAlertStart: { id: AlertId; at: number } | null = null;
  private listener: StateListener;

  constructor(listener: StateListener) {
    this.listener = listener;
  }

  getState(): CentralState {
    return {
      activeAlert: this.currentAlert,
      activeRadio: this.currentRadio,
      isRadioPlaying: this.isRadioPlaying,
      radioVolume: this.radioVolume,
      lastError: this.lastError,
    };
  }

  async playAlert(alertId: AlertId) {
    const alert = getAlertById(alertId);

    if (!alert) {
      this.setError("Alerta desconhecido.");
      return;
    }

    const now = Date.now();
    if (
      this.currentAlert === alertId &&
      this.lastAlertStart &&
      now - this.lastAlertStart.at < 1500
    ) {
      return;
    }

    if (this.alertAudio) {
      this.stopAlert(false);
    }

    if (this.radioAudio) {
      this.radioAudio.muted = true;
    }

    const audio = new Audio(alert.soundPath);
    audio.volume = 1;

    this.alertAudio = audio;
    this.currentAlert = alertId;
    this.lastAlertStart = { id: alertId, at: now };
    this.lastError = null;
    this.notify();

    const finishAlert = () => {
      if (this.alertAudio !== audio) {
        return;
      }

      this.stopAlert(true);
    };

    audio.onended = finishAlert;
    audio.onerror = () => {
      this.setError(`Erro ao reproduzir o alerta ${alert.label}.`);
      finishAlert();
    };

    try {
      await audio.play();
    } catch (error) {
      console.error("Erro ao reproduzir alerta:", error);
      this.setError(`Erro ao iniciar o alerta ${alert.label}.`);
      finishAlert();
    }
  }

  stopAlert(restoreRadioAfter = true) {
    if (this.alertAudio) {
      this.alertAudio.onended = null;
      this.alertAudio.onerror = null;
      this.alertAudio.pause();
      this.alertAudio.currentTime = 0;
    }

    this.alertAudio = null;
    this.currentAlert = null;

    if (restoreRadioAfter) {
      this.restoreRadio();
    }

    this.notify();
  }

  async playRadio(radioId: RadioStationId = this.currentRadio ?? DEFAULT_RADIO_ID) {
    const station = getRadioById(radioId);

    if (!station) {
      this.setError("Estacao de radio desconhecida.");
      return;
    }

    if (this.radioAudio && this.currentRadio === station.id && this.isRadioPlaying) {
      this.currentRadio = station.id;
      this.notify();
      return;
    }

    if (this.radioAudio) {
      this.stopRadio();
    }

    const radio = new Audio();
    radio.preload = "none";
    radio.src = station.url;
    radio.volume = this.radioVolume;
    radio.muted = Boolean(this.alertAudio);

    this.radioAudio = radio;
    this.currentRadio = station.id;
    this.lastError = null;
    this.notify();

    radio.onerror = () => {
      if (this.radioAudio !== radio) {
        return;
      }

      this.setError(`Erro ao reproduzir a estacao ${station.name}.`);
      this.stopRadio();
    };

    try {
      await radio.play();
      this.isRadioPlaying = true;
      this.notify();
    } catch (error) {
      console.error(`Erro ao iniciar a estacao ${station.name}:`, error);

      if (this.radioAudio === radio) {
        this.setError(`Erro ao iniciar a estacao ${station.name}.`);
        this.stopRadio();
      }
    }
  }

  stopRadio() {
    if (this.radioAudio) {
      this.radioAudio.onerror = null;
      this.radioAudio.pause();
      this.radioAudio.removeAttribute("src");
      this.radioAudio.load();
    }

    this.radioAudio = null;
    this.isRadioPlaying = false;
    this.notify();
  }

  setRadioVolume(volume: number) {
    const nextVolume = Math.min(1, Math.max(0, volume));
    this.radioVolume = nextVolume;

    if (this.radioAudio) {
      this.radioAudio.volume = nextVolume;
    }

    this.notify();
  }

  destroy() {
    this.stopAlert(false);
    this.stopRadio();
  }

  private restoreRadio() {
    if (this.radioAudio) {
      this.radioAudio.muted = false;
    }
  }

  private setError(message: string) {
    this.lastError = message;
    this.notify();
  }

  private notify() {
    this.listener(this.getState());
  }
}
