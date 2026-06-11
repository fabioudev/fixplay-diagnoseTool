mod commands;
mod state;

use state::AppState;

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info".into()),
        )
        .init();

    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::flash::scan_devices,
            commands::uart::list_ports,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
