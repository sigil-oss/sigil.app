use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

pub struct AutoLockState {
    last_activity: Arc<Mutex<Instant>>,
    timeout_minutes: Arc<Mutex<u64>>,
    enabled: Arc<Mutex<bool>>,
    lock_on_sleep: Arc<Mutex<bool>>,
    last_poll_wall: Arc<Mutex<SystemTime>>,
}

impl Default for AutoLockState {
    fn default() -> Self {
        Self {
            last_activity: Arc::new(Mutex::new(Instant::now())),
            timeout_minutes: Arc::new(Mutex::new(15)),
            enabled: Arc::new(Mutex::new(true)),
            lock_on_sleep: Arc::new(Mutex::new(true)),
            last_poll_wall: Arc::new(Mutex::new(SystemTime::now())),
        }
    }
}

impl AutoLockState {
    fn lock_recover<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
        m.lock().unwrap_or_else(|e| e.into_inner())
    }

    pub fn reset(&self) {
        *Self::lock_recover(&self.last_activity) = Instant::now();
    }

    pub fn set_timeout(&self, minutes: u64) {
        *Self::lock_recover(&self.timeout_minutes) = minutes;
        *Self::lock_recover(&self.enabled) = minutes > 0;
    }

    pub fn set_lock_on_sleep(&self, enabled: bool) {
        *Self::lock_recover(&self.lock_on_sleep) = enabled;
    }

    pub fn seconds_until_lock(&self) -> Option<u64> {
        let enabled = *Self::lock_recover(&self.enabled);
        if !enabled {
            return None;
        }
        let timeout = Duration::from_secs(*Self::lock_recover(&self.timeout_minutes) * 60);
        let elapsed = Self::lock_recover(&self.last_activity).elapsed();
        timeout.checked_sub(elapsed).map(|r| r.as_secs())
    }
}

pub fn spawn_lock_watcher(app: AppHandle) {
    let state = app.state::<AutoLockState>();
    let last_activity = Arc::clone(&state.last_activity);
    let timeout_minutes = Arc::clone(&state.timeout_minutes);
    let enabled = Arc::clone(&state.enabled);
    let lock_on_sleep = Arc::clone(&state.lock_on_sleep);
    let last_poll_wall = Arc::clone(&state.last_poll_wall);

    std::thread::spawn(move || loop {
        const POLL_SECS: u64 = 10;
        std::thread::sleep(Duration::from_secs(POLL_SECS));

        let now_wall = SystemTime::now();

        // Sleep detection: if wall clock jumped well beyond the poll interval, the
        // system was suspended. Emit lock immediately if lock_on_sleep is set.
        {
            let mut last_wall = last_poll_wall.lock().unwrap_or_else(|e| e.into_inner());
            let wall_delta = now_wall.duration_since(*last_wall).unwrap_or_default();
            *last_wall = now_wall;

            if *lock_on_sleep.lock().unwrap_or_else(|e| e.into_inner()) && wall_delta.as_secs() > POLL_SECS + 20 {
                app.emit("sigil:lock", ()).ok();
                *last_activity.lock().unwrap_or_else(|e| e.into_inner()) = Instant::now();
                continue;
            }
        }

        // Idle timeout check
        let is_enabled = *enabled.lock().unwrap_or_else(|e| e.into_inner());
        if !is_enabled {
            continue;
        }

        let timeout = Duration::from_secs(*timeout_minutes.lock().unwrap_or_else(|e| e.into_inner()) * 60);
        let elapsed = last_activity.lock().unwrap_or_else(|e| e.into_inner()).elapsed();

        if elapsed >= timeout {
            app.emit("sigil:lock", ()).ok();
            *last_activity.lock().unwrap_or_else(|e| e.into_inner()) = Instant::now();
        }
    });
}
