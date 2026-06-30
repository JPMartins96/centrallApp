import type { IconType } from "react-icons";
import { FaCarCrash } from "react-icons/fa";
import { FaHouseFire, FaRadio } from "react-icons/fa6";
import {
  GiAmbulance,
  GiBurningForest,
  GiTrumpet,
  GiWaterTank,
} from "react-icons/gi";

export const ALERTS = [
  {
    id: "inem",
    label: "INEM",
    soundPath: "/sounds/INEM.mp3",
    className: "alerta-inem",
    icon: GiAmbulance,
  },
  {
    id: "inem-reserva",
    label: "INEM - Reserva",
    soundPath: "/sounds/INEM - Reserva.mp3",
    className: "alerta-reserva",
    icon: GiAmbulance,
  },
  {
    id: "florestal",
    label: "Incendio Florestal",
    soundPath: "/sounds/Florestal.mp3",
    className: "alerta-florestal",
    icon: GiBurningForest,
  },
  {
    id: "apoio",
    label: "Incendio Florestal - Apoio",
    soundPath: "/sounds/Apoio.mp3",
    className: "alerta-apoio",
    icon: GiBurningForest,
  },
  {
    id: "elac",
    label: "ELAC",
    soundPath: "/sounds/ELAC.mp3",
    className: "alerta-elac",
    icon: GiWaterTank,
  },
  {
    id: "urbano",
    label: "Incendio Urbano",
    soundPath: "/sounds/Urbano.mp3",
    className: "alerta-urbano",
    icon: FaHouseFire,
  },
  {
    id: "acidente",
    label: "Acidente",
    soundPath: "/sounds/Acidente.mp3",
    className: "alerta-acidente",
    icon: FaCarCrash,
  },
  {
    id: "alvorada",
    label: "Alvorada",
    soundPath: "/sounds/Alvorada.mp3",
    className: "alerta-alvorada",
    icon: GiTrumpet,
  },
] as const;

export const RADIO_STATIONS = [
  {
    id: "rfm",
    name: "RFM",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RFM.mp3",
    icon: FaRadio,
  },
  {
    id: "m80",
    name: "M80",
    url: "https://stream-icy.bauermedia.pt/m80.mp3",
    icon: FaRadio,
  },
  {
    id: "radio-comercial",
    name: "Radio Comercial",
    url: "https://stream-icy.bauermedia.pt/comercial.mp3",
    icon: FaRadio,
  },
  {
    id: "antena-3",
    name: "Antena 3",
    url: "https://streaming-live.rtp.pt/liveradio/antena380a/playlist.m3u8",
    icon: FaRadio,
  },
] as const;

export type AlertId = (typeof ALERTS)[number]["id"];
export type RadioStationId = (typeof RADIO_STATIONS)[number]["id"];

export type AlertDefinition = {
  id: AlertId;
  label: string;
  soundPath: string;
  className: string;
  icon: IconType;
};

export type RadioStation = {
  id: RadioStationId;
  name: string;
  url: string;
  icon: IconType;
};

export const DEFAULT_RADIO_ID: RadioStationId = "rfm";

export function getAlertById(id: string): AlertDefinition | undefined {
  return ALERTS.find((alert) => alert.id === id);
}

export function getRadioById(id: string): RadioStation | undefined {
  return RADIO_STATIONS.find((station) => station.id === id);
}
