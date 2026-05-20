use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

pub struct ClipboardState {
    clear_at: Arc<Mutex<Option<Instant>>>,
}

impl Default for ClipboardState {
    fn default() -> Self {
        Self {
            clear_at: Arc::new(Mutex::new(None)),
        }
    }
}

impl ClipboardState {
    fn lock_recover(m: &Mutex<Option<Instant>>) -> std::sync::MutexGuard<'_, Option<Instant>> {
        m.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn schedule_clear(&self, after_secs: u64) {
        *Self::lock_recover(&self.clear_at) = if after_secs == 0 {
            None
        } else {
            Some(Instant::now() + Duration::from_secs(after_secs))
        };
    }

    pub fn cancel_clear(&self) {
        *Self::lock_recover(&self.clear_at) = None;
    }

    pub fn should_clear(&self) -> bool {
        Self::lock_recover(&self.clear_at).map_or(false, |at| Instant::now() >= at)
    }
}

pub fn spawn_clipboard_watcher(app: AppHandle) {
    let state = app.state::<ClipboardState>();
    let clipboard_state = ClipboardState {
        clear_at: Arc::clone(&state.clear_at),
    };

    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(1));

        if clipboard_state.should_clear() {
            app.clipboard().write_text("").ok();
            clipboard_state.cancel_clear();
        }
    });
}
