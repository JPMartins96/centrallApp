import { useState } from "react";
import { FaArrowLeft } from "react-icons/fa";
import { CentralPanel } from "./components/CentralPanel";
import { MobileRemoteApp } from "./components/MobileRemoteApp";
import { RemoteAdminPanel } from "./components/RemoteAdminPanel";
import { useCentralController } from "./hooks/useCentralController";
import "./App.css";

function App() {
  const isRemoteClient =
    import.meta.env.VITE_CLIENT_MODE === "remote" ||
    window.location.hash === "#/remote" ||
    new URLSearchParams(window.location.search).get("mode") === "remote";

  if (isRemoteClient) {
    return <MobileRemoteApp />;
  }

  return <CentralDesktopApp />;
}

function CentralDesktopApp() {
  const { state, dashboard, isDashboardLoading, actions } = useCentralController();
  const [activeView, setActiveView] = useState<"control" | "settings">("control");

  return (
    <main>
      <header className="header container">
        <img src="sireneIcon.png" className="headerIcon" alt="" />
        <div className="titleWrapper">
          <h1>Central de Alarmes</h1>
          <h2>Painel de Controlo</h2>
        </div>
      </header>

      {activeView === "control" ? (
        <CentralPanel
          state={state}
          onPlayAlert={(alertId) => void actions.playAlert(alertId)}
          onStopAlert={() => void actions.stopAlert()}
          onPlayRadio={(radioId) => void actions.playRadio(radioId)}
          onStopRadio={() => void actions.stopRadio()}
          onVolumeChange={(volume) => void actions.setRadioVolume(volume)}
          onOpenSettings={() => setActiveView("settings")}
        />
      ) : (
        <section className="settingsView" aria-label="Configuracoes">
          <div className="settingsToolbar">
            <button
              type="button"
              className="controlBtn secondaryBtn"
              onClick={() => setActiveView("control")}
            >
              <FaArrowLeft aria-hidden="true" />
              <span>Voltar</span>
            </button>
            <div>
              <h3>Configuracoes</h3>
              <p>Controlo remoto para dispositivos na rede interna.</p>
            </div>
          </div>

          <RemoteAdminPanel
            dashboard={dashboard}
            isLoading={isDashboardLoading}
            onSetEnabled={(enabled) => void actions.setRemoteEnabled(enabled)}
            onRefresh={() => void actions.refreshDashboard()}
          />
        </section>
      )}
    </main>
  );
}

export default App;
