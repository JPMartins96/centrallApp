import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { FaCarCrash, FaPlay, FaVolumeMute, FaVolumeUp } from "react-icons/fa";
import { FaHouseFire, FaRadio } from "react-icons/fa6";
import {
  GiAmbulance,
  GiBurningForest,
  GiTrumpet,
  GiWaterTank,
} from "react-icons/gi";
import { LuRadioTower, LuSiren } from "react-icons/lu";
import "./App.css";

type RadioStation = {
  id: string;
  name: string;
  url: string;
};

const RADIO_STATIONS: RadioStation[] = [
  {
    id: "rfm",
    name: "RFM",
    url: "https://playerservices.streamtheworld.com/api/livestream-redirect/RFM.mp3",
  },
  {
    id: "m80",
    name: "M80",
    url: "https://stream-icy.bauermedia.pt/m80.mp3",
  },
  {
    id: "radio-comercial",
    name: "Rádio Comercial",
    url: "https://stream-icy.bauermedia.pt/comercial.mp3",
  },
  {
    id: "antena-3",
    name: "Antena 3",
    url: "https://streaming-live.rtp.pt/liveradio/antena380a/playlist.m3u8",
  },
];

function App() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentSoundRef = useRef<string | null>(null);

  const radioRef = useRef<HTMLAudioElement | null>(null);
  const currentRadioRef = useRef<RadioStation | null>(null);

  const [isRadioPlaying, setIsRadioPlaying] = useState<boolean>(false);
  const [radioVolume, setRadioVolume] = useState(0.99);
  const [selectedRadio, setSelectedRadio] = useState<RadioStation>(
    RADIO_STATIONS[0],
  );

  function stopAlert(restoreRadioAfter = true) {
    const audio = audioRef.current;

    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
    }

    audioRef.current = null;
    currentSoundRef.current = null;

    if (restoreRadioAfter) {
      restoreRadio();
    }
  }

  async function playSound(soundPath: string) {
    const currentAudio = audioRef.current;
    const isSameSound = currentSoundRef.current === soundPath;

    if (currentAudio && isSameSound) {
      stopAlert();
      return;
    }

    if (currentAudio) {
      stopAlert(false);
    }

    if (radioRef.current) {
      radioRef.current.muted = true;
    }

    const audio = new Audio(soundPath);

    audio.volume = 1;

    audioRef.current = audio;
    currentSoundRef.current = soundPath;

    function finishAlert() {
      if (audioRef.current !== audio) {
        return;
      }

      stopAlert();
    }

    audio.onended = finishAlert;
    audio.onerror = finishAlert;

    try {
      await audio.play();
    } catch (error) {
      console.error("Erro ao reproduzir áudio:", error);
      finishAlert();
    }
  }

  async function playRadio(station: RadioStation) {
    const currentRadio = radioRef.current;
    const isSameRadio = currentRadioRef.current?.id === station.id;

    // Clicou novamente na estação que está ligada.
    if (currentRadio && isSameRadio) {
      stopRadio();
      return;
    }

    // Se estiver outra estação ligada, desliga-a.
    if (currentRadio) {
      stopRadio();
    }

    const radio = new Audio();

    radio.preload = "none";
    radio.src = station.url;
    radio.volume = radioVolume;

    // Se existir um alerta ativo, a rádio inicia sem som.
    radio.muted = Boolean(audioRef.current);

    radioRef.current = radio;
    currentRadioRef.current = station;
    setSelectedRadio(station);

    radio.onerror = () => {
      if (radioRef.current !== radio) {
        return;
      }

      console.error(`Erro ao reproduzir a estação ${station.name}.`);
      stopRadio();
    };

    try {
      await radio.play();
      setIsRadioPlaying(true);
    } catch (error) {
      console.error(`Erro ao iniciar a estação ${station.name}:`, error);

      if (radioRef.current === radio) {
        stopRadio();
      }
    }
  }

  function stopRadio() {
    const radio = radioRef.current;

    if (radio) {
      radio.onerror = null;
      radio.pause();

      // Interrompe também a ligação ao stream.
      radio.removeAttribute("src");
      radio.load();
    }

    radioRef.current = null;
    currentRadioRef.current = null;
    setIsRadioPlaying(false);
  }

  function restoreRadio() {
    if (radioRef.current) {
      radioRef.current.muted = false;
    }
  }

  function handleRadioVolume(event: ChangeEvent<HTMLInputElement>) {
    const newVolume = Number(event.target.value);

    setRadioVolume(newVolume);

    if (radioRef.current) {
      radioRef.current.volume = newVolume;
    }
  }

  useEffect(() => {
    return () => {
      const alertAudio = audioRef.current;
      const radioAudio = radioRef.current;

      if (alertAudio) {
        alertAudio.pause();
      }

      if (radioAudio) {
        radioAudio.pause();
        radioAudio.removeAttribute("src");
        radioAudio.load();
      }
    };
  }, []);
  return (
    <main>
      <div className={"header container"}>
        <img src={"sireneIcon.png"} className={"headerIcon"} />
        <div className={"titleWrapper"}>
          <h1>Central de Alarmes</h1>
          <h2>Painel de Controlo</h2>
        </div>
      </div>
      <div className={"contentWrapper"}>
        <div className={"container alertasWrapper"}>
          <div className={"alertasHeader"}>
            <LuSiren size={32} />
            <h3>Alertas</h3>
          </div>
          <div className={"btnWrapper"}>
            <button
              type={"button"}
              onClick={() => playSound("/sounds/INEM.mp3")}
              className={"btnAlerta alerta-inem"}
            >
              <GiAmbulance size={60} />
              <span>INEM</span>
            </button>
            <button
              type={"button"}
              onClick={() => playSound("/sounds/INEM - Reserva.mp3")}
              className={"btnAlerta alerta-reserva"}
            >
              <GiAmbulance size={60} />
              <span>INEM - Reserva</span>
            </button>
            <button
              type={"button"}
              onClick={() => {
                playSound("/sounds/Florestal.mp3");
              }}
              className={"btnAlerta alerta-florestal"}
            >
              <GiBurningForest size={60} />
              <span>Incêndio Florestal</span>
            </button>
            <button
              type={"button"}
              onClick={() => {
                playSound("/sounds/Apoio.mp3");
              }}
              className={"btnAlerta alerta-apoio"}
            >
              <GiBurningForest size={60} />
              <span>Icêndio Florestal - Apoio</span>
            </button>
            <button
              type={"button"}
              onClick={() => {
                playSound("/sounds/ELAC.mp3");
              }}
              className={"btnAlerta alerta-elac"}
            >
              <GiWaterTank size={60} />
              <span>ELAC</span>
            </button>
            <button
              type={"button"}
              onClick={() => {
                playSound("/sounds/Urbano.mp3");
              }}
              className={"btnAlerta alerta-urbano"}
            >
              <FaHouseFire size={60} />
              <span>Incêndio Urbano</span>
            </button>
            <button
              type={"button"}
              onClick={() => {
                playSound("/sounds/Acidente.mp3");
              }}
              className={"btnAlerta alerta-acidente"}
            >
              <FaCarCrash size={60} />
              <span>Acidente</span>
            </button>
            <button
              type={"button"}
              onClick={() => {
                playSound("/sounds/Alvorada.mp3");
              }}
              className={"btnAlerta alerta-alvorada"}
            >
              <GiTrumpet size={60} />
              <span>Alvorada</span>
            </button>
          </div>
        </div>
        <div className={"container radiosWrapper"}>
          <div className={"radiosHeader"}>
            <LuRadioTower size={32} />
            <h3>Rádios</h3>
          </div>
          <div className="btnWrapper radioWrapper">
            {RADIO_STATIONS.map((station) => {
              const isActive =
                isRadioPlaying && selectedRadio.id === station.id;

              return (
                <button
                  key={station.id}
                  type="button"
                  className={`btnAlerta ${isActive ? "active" : ""}`}
                  onClick={() => playRadio(station)}
                  aria-pressed={isActive}
                >
                  <FaRadio size={60} />
                  <span>{station.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className={"container controlPanelWrapper"}>
        {isRadioPlaying ? (
          <button
            type={"button"}
            onClick={() => {
              stopRadio();
            }}
            className={"controlBtn stopRadioBtn"}
          >
            <FaVolumeMute size={25} />
            <span>Parar Rádio</span>
          </button>
        ) : (
          <button
            onClick={() => playRadio(selectedRadio)}
            type={"button"}
            className={"controlBtn playRadioBtn"}
          >
            <FaPlay size={25} />
            <span>Play Rádio</span>
          </button>
        )}
        <div className={"volumeControl"}>
          <FaVolumeUp size={25} />
          <input
            id={"radioVolume"}
            type={"range"}
            min={0}
            max={1}
            step={0.01}
            value={radioVolume}
            onChange={handleRadioVolume}
            className={"volumeSlider"}
          />
        </div>
        <div className={"infoRadio"}>
          <span>A reproduzir:</span>
          <br />
          <span style={{ color: "lightblue" }}>
            {isRadioPlaying ? selectedRadio.name : "Nenhum"}
          </span>
        </div>
      </div>
    </main>
  );
}

export default App;
