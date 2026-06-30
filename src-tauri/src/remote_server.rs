use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Path, State,
    },
    http::{header, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    net::{IpAddr, Ipv4Addr, SocketAddr, UdpSocket},
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{broadcast, oneshot};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

const DEFAULT_PORT: u16 = 8787;
const MAX_LOG_ENTRIES: usize = 80;
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(2);
const RATE_LIMIT_MAX: usize = 8;

const ALERT_IDS: &[&str] = &[
    "inem",
    "inem-reserva",
    "florestal",
    "apoio",
    "elac",
    "urbano",
    "acidente",
    "alvorada",
];

const RADIO_IDS: &[&str] = &["rfm", "m80", "radio-comercial", "RR"];

#[derive(Clone)]
pub struct RemoteServer {
    inner: Arc<RemoteServerInner>,
}

struct RemoteServerInner {
    app: AppHandle,
    config_path: PathBuf,
    config: Mutex<StoredConfig>,
    state: Mutex<CentralState>,
    action_log: Mutex<Vec<ActionLogEntry>>,
    rate_limits: Mutex<HashMap<String, Vec<Instant>>>,
    running: AtomicBool,
    connected_clients: AtomicUsize,
    shutdown: Mutex<Option<oneshot::Sender<()>>>,
    broadcaster: broadcast::Sender<ServerMessage>,
    last_alert_command: Mutex<Option<(String, Instant)>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CentralState {
    pub active_alert: Option<String>,
    pub active_radio: Option<String>,
    pub is_radio_playing: bool,
    pub radio_volume: f64,
    pub last_error: Option<String>,
}

impl Default for CentralState {
    fn default() -> Self {
        Self {
            active_alert: None,
            active_radio: Some("rfm".to_string()),
            is_radio_playing: false,
            radio_volume: 1.0,
            last_error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredConfig {
    enabled: bool,
    port: u16,
    device_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionLogEntry {
    id: String,
    at: String,
    source: String,
    action: String,
    detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteServerDashboard {
    enabled: bool,
    running: bool,
    device_name: String,
    local_ip: Option<String>,
    port: u16,
    server_url: Option<String>,
    connected_clients: usize,
    action_log: Vec<ActionLogEntry>,
    state: CentralState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum RemoteCommand {
    PlayAlert {
        id: String,
        #[serde(rename = "alertId")]
        alert_id: String,
        source: String,
    },
    StopAlert {
        id: String,
        source: String,
    },
    PlayRadio {
        id: String,
        #[serde(rename = "radioId")]
        radio_id: Option<String>,
        source: String,
    },
    StopRadio {
        id: String,
        source: String,
    },
    SetRadioVolume {
        id: String,
        volume: f64,
        source: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    State { state: CentralState },
}

#[derive(Debug, Serialize)]
struct CatalogResponse {
    alerts: Vec<CatalogItem>,
    radios: Vec<CatalogItem>,
}

#[derive(Debug, Serialize)]
struct CatalogItem {
    id: &'static str,
    label: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<&'static str>,
}

#[derive(Debug, Deserialize)]
struct VolumeRequest {
    volume: f64,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

#[derive(Debug, Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(ErrorBody {
                error: self.message,
            }),
        )
            .into_response()
    }
}

type ApiResult<T> = Result<T, ApiError>;

impl RemoteServer {
    pub fn new(app: AppHandle) -> Self {
        let config_path = config_path(&app);
        let config = load_config(&config_path);
        let (broadcaster, _) = broadcast::channel(100);

        Self {
            inner: Arc::new(RemoteServerInner {
                app,
                config_path,
                config: Mutex::new(config),
                state: Mutex::new(CentralState::default()),
                action_log: Mutex::new(Vec::new()),
                rate_limits: Mutex::new(HashMap::new()),
                running: AtomicBool::new(false),
                connected_clients: AtomicUsize::new(0),
                shutdown: Mutex::new(None),
                broadcaster,
                last_alert_command: Mutex::new(None),
            }),
        }
    }

    pub async fn start_if_enabled(&self) -> Result<(), String> {
        if self.inner.config.lock().unwrap().enabled {
            self.start_server().await?;
        }

        Ok(())
    }

    pub async fn set_enabled(&self, enabled: bool) -> Result<(), String> {
        {
            let mut config = self.inner.config.lock().unwrap();
            config.enabled = enabled;
            save_config(&self.inner.config_path, &config)?;
        }

        if enabled {
            self.start_server().await
        } else {
            self.stop_server();
            Ok(())
        }
    }

    pub fn dashboard(&self) -> RemoteServerDashboard {
        let config = self.inner.config.lock().unwrap().clone();
        let local_ip = local_ip_address();
        let server_url = local_ip
            .as_ref()
            .map(|ip| format!("http://{}:{}", ip, config.port));

        RemoteServerDashboard {
            enabled: config.enabled,
            running: self.inner.running.load(Ordering::SeqCst),
            device_name: config.device_name,
            local_ip,
            port: config.port,
            server_url,
            connected_clients: self.inner.connected_clients.load(Ordering::SeqCst),
            action_log: self.inner.action_log.lock().unwrap().clone(),
            state: self.inner.state.lock().unwrap().clone(),
        }
    }

    pub fn update_central_state(&self, state: CentralState) {
        {
            let mut current = self.inner.state.lock().unwrap();
            *current = state.clone();
        }

        let _ = self.inner.broadcaster.send(ServerMessage::State { state });
    }

    pub fn record_local_action(&self, action: String, detail: String) {
        self.inner.push_log("central".to_string(), action, detail);
    }

    async fn start_server(&self) -> Result<(), String> {
        if self.inner.running.load(Ordering::SeqCst) {
            return Ok(());
        }

        let port = self.inner.config.lock().unwrap().port;
        let addr = SocketAddr::from(([0, 0, 0, 0], port));
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .map_err(|error| format!("Nao foi possivel iniciar servidor: {error}"))?;
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        {
            let mut shutdown = self.inner.shutdown.lock().unwrap();
            *shutdown = Some(shutdown_tx);
        }

        self.inner.running.store(true, Ordering::SeqCst);

        let inner = self.inner.clone();
        tauri::async_runtime::spawn(async move {
            let app = router(inner.clone());
            let result = axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(async {
                let _ = shutdown_rx.await;
            })
            .await;

            if let Err(error) = result {
                inner.push_log(
                    "servidor".to_string(),
                    "erro".to_string(),
                    format!("Servidor terminou com erro: {error}"),
                );
            }

            inner.running.store(false, Ordering::SeqCst);
            inner.connected_clients.store(0, Ordering::SeqCst);
        });

        self.inner.push_log(
            "servidor".to_string(),
            "start".to_string(),
            format!("Servidor iniciado na porta {port}"),
        );

        Ok(())
    }

    fn stop_server(&self) {
        if let Some(shutdown) = self.inner.shutdown.lock().unwrap().take() {
            let _ = shutdown.send(());
        }

        self.inner.push_log(
            "servidor".to_string(),
            "stop".to_string(),
            "Servidor desativado".to_string(),
        );
    }
}

impl RemoteServerInner {
    fn push_log(&self, source: String, action: String, detail: String) {
        let mut log = self.action_log.lock().unwrap();
        log.insert(
            0,
            ActionLogEntry {
                id: Uuid::new_v4().to_string(),
                at: now_label(),
                source,
                action,
                detail,
            },
        );

        if log.len() > MAX_LOG_ENTRIES {
            log.truncate(MAX_LOG_ENTRIES);
        }
    }

    fn check_rate_limit(&self, key: &str) -> ApiResult<()> {
        let now = Instant::now();
        let mut limits = self.rate_limits.lock().unwrap();
        let entries = limits.entry(key.to_string()).or_default();
        entries.retain(|entry| now.duration_since(*entry) <= RATE_LIMIT_WINDOW);

        if entries.len() >= RATE_LIMIT_MAX {
            return Err(api_error(
                StatusCode::TOO_MANY_REQUESTS,
                "Demasiados pedidos.",
            ));
        }

        entries.push(now);
        Ok(())
    }
}

fn router(state: Arc<RemoteServerInner>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    Router::new()
        .route("/api/health", get(health))
        .route("/api/catalog", get(catalog))
        .route("/api/state", get(get_state))
        .route("/api/alerts/{id}/play", post(play_alert))
        .route("/api/alerts/stop", post(stop_alert))
        .route("/api/radio/play", post(play_radio))
        .route("/api/radio/stop", post(stop_radio))
        .route("/api/radio/stations/{id}", post(play_radio_station))
        .route("/api/radio/volume", post(set_radio_volume))
        .route("/ws", get(ws_handler))
        .layer(cors)
        .with_state(state)
}

async fn health(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResult<Json<serde_json::Value>> {
    ensure_local(addr)?;
    state.check_rate_limit(&format!("{}:health", addr.ip()))?;
    let config = state.config.lock().unwrap();

    Ok(Json(serde_json::json!({
        "ok": true,
        "serverName": config.device_name,
        "port": config.port,
    })))
}

async fn catalog(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResult<Json<CatalogResponse>> {
    accept_remote(&state, addr)?;

    Ok(Json(CatalogResponse {
        alerts: vec![
            CatalogItem {
                id: "inem",
                label: "INEM",
                name: None,
            },
            CatalogItem {
                id: "inem-reserva",
                label: "INEM - Reserva",
                name: None,
            },
            CatalogItem {
                id: "florestal",
                label: "Incendio Florestal",
                name: None,
            },
            CatalogItem {
                id: "apoio",
                label: "Incendio Florestal - Apoio",
                name: None,
            },
            CatalogItem {
                id: "elac",
                label: "ELAC",
                name: None,
            },
            CatalogItem {
                id: "urbano",
                label: "Incendio Urbano",
                name: None,
            },
            CatalogItem {
                id: "acidente",
                label: "Acidente",
                name: None,
            },
            CatalogItem {
                id: "alvorada",
                label: "Alvorada",
                name: None,
            },
        ],
        radios: vec![
            CatalogItem {
                id: "rfm",
                label: "RFM",
                name: Some("RFM"),
            },
            CatalogItem {
                id: "m80",
                label: "M80",
                name: Some("M80"),
            },
            CatalogItem {
                id: "radio-comercial",
                label: "Radio Comercial",
                name: Some("Radio Comercial"),
            },
            CatalogItem {
                id: "RR",
                label: "Rádio Renascença",
                name: Some("Rádio Renascença"),
            },
        ],
    }))
}

async fn get_state(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResult<Json<CentralState>> {
    accept_remote(&state, addr)?;
    Ok(Json(state.state.lock().unwrap().clone()))
}

async fn play_alert(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(alert_id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let source = accept_remote(&state, addr)?;
    validate_id(&alert_id, ALERT_IDS, "Alerta desconhecido.")?;

    {
        let mut last = state.last_alert_command.lock().unwrap();
        if let Some((last_id, last_at)) = last.as_ref() {
            if last_id == &alert_id && last_at.elapsed() < Duration::from_millis(1500) {
                state.push_log(source, "duplicate_alert_ignored".to_string(), alert_id);
                return Ok(Json(
                    serde_json::json!({ "accepted": false, "duplicate": true }),
                ));
            }
        }
        *last = Some((alert_id.clone(), Instant::now()));
    }

    emit_command(
        &state,
        RemoteCommand::PlayAlert {
            id: Uuid::new_v4().to_string(),
            alert_id: alert_id.clone(),
            source: source.clone(),
        },
    )?;
    state.push_log(source, "play_alert".to_string(), alert_id);
    Ok(Json(serde_json::json!({ "accepted": true })))
}

async fn stop_alert(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResult<Json<serde_json::Value>> {
    let source = accept_remote(&state, addr)?;
    emit_command(
        &state,
        RemoteCommand::StopAlert {
            id: Uuid::new_v4().to_string(),
            source: source.clone(),
        },
    )?;
    state.push_log(source, "stop_alert".to_string(), "Parar alerta".to_string());
    Ok(Json(serde_json::json!({ "accepted": true })))
}

async fn play_radio(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResult<Json<serde_json::Value>> {
    let source = accept_remote(&state, addr)?;
    emit_command(
        &state,
        RemoteCommand::PlayRadio {
            id: Uuid::new_v4().to_string(),
            radio_id: None,
            source: source.clone(),
        },
    )?;
    state.push_log(
        source,
        "play_radio".to_string(),
        "Retomar radio".to_string(),
    );
    Ok(Json(serde_json::json!({ "accepted": true })))
}

async fn play_radio_station(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Path(radio_id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let source = accept_remote(&state, addr)?;
    validate_id(&radio_id, RADIO_IDS, "Estacao desconhecida.")?;
    emit_command(
        &state,
        RemoteCommand::PlayRadio {
            id: Uuid::new_v4().to_string(),
            radio_id: Some(radio_id.clone()),
            source: source.clone(),
        },
    )?;
    state.push_log(source, "play_radio".to_string(), radio_id);
    Ok(Json(serde_json::json!({ "accepted": true })))
}

async fn stop_radio(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
) -> ApiResult<Json<serde_json::Value>> {
    let source = accept_remote(&state, addr)?;
    emit_command(
        &state,
        RemoteCommand::StopRadio {
            id: Uuid::new_v4().to_string(),
            source: source.clone(),
        },
    )?;
    state.push_log(source, "stop_radio".to_string(), "Parar radio".to_string());
    Ok(Json(serde_json::json!({ "accepted": true })))
}

async fn set_radio_volume(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(payload): Json<VolumeRequest>,
) -> ApiResult<Json<serde_json::Value>> {
    let source = accept_remote(&state, addr)?;

    if !(0.0..=1.0).contains(&payload.volume) {
        return Err(api_error(StatusCode::BAD_REQUEST, "Volume invalido."));
    }

    emit_command(
        &state,
        RemoteCommand::SetRadioVolume {
            id: Uuid::new_v4().to_string(),
            volume: payload.volume,
            source: source.clone(),
        },
    )?;
    state.push_log(
        source,
        "set_radio_volume".to_string(),
        payload.volume.to_string(),
    );
    Ok(Json(serde_json::json!({ "accepted": true })))
}

async fn ws_handler(
    State(state): State<Arc<RemoteServerInner>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    ws: WebSocketUpgrade,
) -> ApiResult<Response> {
    let source = accept_remote(&state, addr)?;
    Ok(ws
        .on_upgrade(move |socket| websocket_connection(socket, state, source))
        .into_response())
}

async fn websocket_connection(
    socket: WebSocket,
    state: Arc<RemoteServerInner>,
    device_name: String,
) {
    state.connected_clients.fetch_add(1, Ordering::SeqCst);
    state.push_log(
        device_name.clone(),
        "connect".to_string(),
        "WebSocket ligado".to_string(),
    );

    let (mut sender, mut receiver) = socket.split();
    let mut rx = state.broadcaster.subscribe();
    let initial_state = state.state.lock().unwrap().clone();
    let initial_payload = serde_json::to_string(&ServerMessage::State {
        state: initial_state,
    });

    if let Ok(payload) = initial_payload {
        let _ = sender.send(Message::Text(payload.into())).await;
    }

    loop {
        tokio::select! {
            message = rx.recv() => {
                match message {
                    Ok(message) => {
                        if let Ok(payload) = serde_json::to_string(&message) {
                            if sender.send(Message::Text(payload.into())).await.is_err() {
                                break;
                            }
                        }
                    }
                    Err(_) => break,
                }
            }
            incoming = receiver.next() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(_)) => {}
                    Some(Err(_)) => break,
                }
            }
        }
    }

    state.connected_clients.fetch_sub(1, Ordering::SeqCst);
    state.push_log(
        device_name,
        "disconnect".to_string(),
        "WebSocket desligado".to_string(),
    );
}

fn accept_remote(state: &RemoteServerInner, addr: SocketAddr) -> ApiResult<String> {
    ensure_local(addr)?;
    state.check_rate_limit(&format!("{}:api", addr.ip()))?;
    Ok(addr.ip().to_string())
}

fn emit_command(state: &RemoteServerInner, command: RemoteCommand) -> ApiResult<()> {
    state.app.emit("remote-command", command).map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Erro ao enviar comando para a central: {error}"),
        )
    })
}

fn validate_id(id: &str, allowed: &[&str], message: &str) -> ApiResult<()> {
    if allowed.contains(&id) {
        Ok(())
    } else {
        Err(api_error(StatusCode::BAD_REQUEST, message))
    }
}

fn ensure_local(addr: SocketAddr) -> ApiResult<()> {
    if is_local_network(addr.ip()) {
        Ok(())
    } else {
        Err(api_error(
            StatusCode::FORBIDDEN,
            "Pedidos externos a rede local nao sao permitidos.",
        ))
    }
}

fn is_local_network(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_loopback()
                || ip.is_private()
                || ip.is_link_local()
                || ip == Ipv4Addr::new(255, 255, 255, 255)
        }
        IpAddr::V6(ip) => ip.is_loopback() || ip.is_unique_local() || ip.is_unicast_link_local(),
    }
}

fn api_error(status: StatusCode, message: impl Into<String>) -> ApiError {
    ApiError {
        status,
        message: message.into(),
    }
}

fn config_path(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().app_config_dir() {
        return dir.join("remote-control.json");
    }

    PathBuf::from("remote-control.json")
}

fn load_config(path: &PathBuf) -> StoredConfig {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<StoredConfig>(&content).ok())
        .unwrap_or_else(default_config)
}

fn save_config(path: &PathBuf, config: &StoredConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let content = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn default_config() -> StoredConfig {
    StoredConfig {
        enabled: false,
        port: DEFAULT_PORT,
        device_name: "Central dos Bombeiros".to_string(),
    }
}

fn now_label() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    seconds.to_string()
}

fn local_ip_address() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let local = socket.local_addr().ok()?;

    match local.ip() {
        IpAddr::V4(ip) if !ip.is_loopback() => Some(ip.to_string()),
        _ => None,
    }
}
