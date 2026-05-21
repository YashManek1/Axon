use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct SystemTelemetry {
    pub os: String,
    pub arch: String,
    #[serde(rename = "cpuLoad")]
    pub cpu_load: f64,
    #[serde(rename = "ramTotal")]
    pub ram_total_mb: u64,
    #[serde(rename = "ramUsed")]
    pub ram_used_mb: u64,
    pub hostname: String,
}

pub fn collect_telemetry() -> SystemTelemetry {
    let cpu_load = sys_info::loadavg().map(|load| load.one).unwrap_or(0.0);
    let (ram_total_mb, ram_used_mb) = sys_info::mem_info()
        .map(|mem| {
            let total = mem.total / 1024;
            let free = mem.free / 1024;
            (total, total.saturating_sub(free))
        })
        .unwrap_or((0, 0));
    let hostname = sys_info::hostname().unwrap_or_else(|_| String::new());

    SystemTelemetry {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_load,
        ram_total_mb,
        ram_used_mb,
        hostname,
    }
}
