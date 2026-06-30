mod remote_server;

use remote_server::{CentralState, RemoteServer, RemoteServerDashboard};
use tauri::Manager;

#[tauri::command]
async fn remote_get_dashboard(
    server: tauri::State<'_, RemoteServer>,
) -> Result<RemoteServerDashboard, String> {
    Ok(server.dashboard())
}

#[tauri::command]
async fn remote_set_enabled(
    server: tauri::State<'_, RemoteServer>,
    enabled: bool,
) -> Result<(), String> {
    server.set_enabled(enabled).await
}

#[tauri::command]
fn remote_update_central_state(
    server: tauri::State<'_, RemoteServer>,
    state: CentralState,
) -> Result<(), String> {
    server.update_central_state(state);
    Ok(())
}

#[tauri::command]
fn remote_record_local_action(
    server: tauri::State<'_, RemoteServer>,
    action: String,
    detail: String,
) -> Result<(), String> {
    server.record_local_action(action, detail);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let server = RemoteServer::new(app.handle().clone());
            let startup_server = server.clone();
            app.manage(server);

            tauri::async_runtime::spawn(async move {
                if let Err(error) = startup_server.start_if_enabled().await {
                    eprintln!("Erro ao iniciar servidor remoto: {error}");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            remote_get_dashboard,
            remote_set_enabled,
            remote_update_central_state,
            remote_record_local_action,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
