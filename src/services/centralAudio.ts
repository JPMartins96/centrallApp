import {
  DEFAULT_RADIO_ID,
  getAlertById,
  getRadioById,
  type AlertId,
  type RadioStationId,
} from "../config/catalog";
import type { CentralState } from "../types/remote";

type StateListener = (state: CentralState) => void;

const ALERT_OUTPUT_VOLUME = 1;
const RADIO_OUTPUT_VOLUME_AT_SLIDER_MAX = 0.3;
const RADIO_RESUME_DELAY_MS = 2000;

export class CentralAudioService {
  private alertAudio: HTMLAudioElement | null = null;
  private radioAudio: HTMLAudioElement | null = null;
  private radioVolumeGuard: number | null = null;
  private radioResumeTimeout: number | null = null;
  private currentAlert: AlertId | null = null;
  private currentRadio: RadioStationId | null = DEFAULT_RADIO_ID;
  private isRadioPlaying = false;
  private radioVolume = 1;
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

    this.cancelScheduledRadioRestore();

    if (this.radioAudio) {
      this.radioAudio.muted = true;
    }

    const audio = new Audio(alert.soundPath);
    audio.volume = ALERT_OUTPUT_VOLUME;

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
    audio.onvolumechange = () => {
      if (audio.volume !== ALERT_OUTPUT_VOLUME) {
        audio.volume = ALERT_OUTPUT_VOLUME;
      }
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
      this.alertAudio.onvolumechange = null;
      this.alertAudio.pause();
      this.alertAudio.currentTime = 0;
    }

    this.alertAudio = null;
    this.currentAlert = null;

    if (restoreRadioAfter) {
      this.scheduleRadioRestore();
    }

    this.notify();
  }

  async playRadio(
    radioId: RadioStationId = this.currentRadio ?? DEFAULT_RADIO_ID,
  ) {
    const station = getRadioById(radioId);

    if (!station) {
      this.setError("Estacao de radio desconhecida.");
      return;
    }

    if (
      this.radioAudio &&
      this.currentRadio === station.id &&
      this.isRadioPlaying
    ) {
      this.currentRadio = station.id;
      this.notify();
      return;
    }

    if (this.radioAudio) {
      this.stopRadio();
    }

    const radio = new Audio();
    radio.preload = "none";
    radio.volume = this.getEffectiveRadioVolume();
    radio.muted = Boolean(this.alertAudio);
    radio.src = station.url;

    this.radioAudio = radio;
    this.startRadioVolumeGuard();
    this.applyRadioOutputVolume();
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
    radio.onvolumechange = () => {
      this.applyRadioOutputVolume();
    };
    radio.onloadedmetadata = () => {
      this.applyRadioOutputVolume();
    };
    radio.oncanplay = () => {
      this.applyRadioOutputVolume();
    };
    radio.onplaying = () => {
      this.applyRadioOutputVolume();
    };

    try {
      await radio.play();
      this.applyRadioOutputVolume();
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
    this.cancelScheduledRadioRestore();
    this.stopRadioVolumeGuard();

    if (this.radioAudio) {
      this.radioAudio.onerror = null;
      this.radioAudio.onvolumechange = null;
      this.radioAudio.onloadedmetadata = null;
      this.radioAudio.oncanplay = null;
      this.radioAudio.onplaying = null;
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
      this.applyRadioOutputVolume();
    }

    this.notify();
  }

  destroy() {
    this.cancelScheduledRadioRestore();
    this.stopAlert(false);
    this.stopRadio();
  }

  private scheduleRadioRestore() {
    this.cancelScheduledRadioRestore();

    this.radioResumeTimeout = window.setTimeout(() => {
      this.radioResumeTimeout = null;
      this.restoreRadio();
    }, RADIO_RESUME_DELAY_MS);
  }

  private cancelScheduledRadioRestore() {
    if (this.radioResumeTimeout === null) {
      return;
    }

    window.clearTimeout(this.radioResumeTimeout);
    this.radioResumeTimeout = null;
  }

  private restoreRadio() {
    if (this.alertAudio) {
      return;
    }

    if (this.radioAudio) {
      this.radioAudio.muted = false;
    }
  }

  private setError(message: string) {
    this.lastError = message;
    this.notify();
  }

  private getEffectiveRadioVolume() {
    return this.radioVolume * RADIO_OUTPUT_VOLUME_AT_SLIDER_MAX;
  }

  private applyRadioOutputVolume() {
    if (!this.radioAudio) {
      return;
    }

    const effectiveVolume = this.getEffectiveRadioVolume();

    if (Math.abs(this.radioAudio.volume - effectiveVolume) > 0.001) {
      this.radioAudio.volume = effectiveVolume;
    }
  }

  private startRadioVolumeGuard() {
    this.stopRadioVolumeGuard();

    this.radioVolumeGuard = window.setInterval(() => {
      this.applyRadioOutputVolume();
    }, 250);
  }

  private stopRadioVolumeGuard() {
    if (this.radioVolumeGuard === null) {
      return;
    }

    window.clearInterval(this.radioVolumeGuard);
    this.radioVolumeGuard = null;
  }

  private notify() {
    this.listener(this.getState());
  }
}
