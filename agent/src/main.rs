use dotenv::dotenv;
use rust_socketio::{ClientBuilder, Payload, RawClient};
use serde_json::json;
use std::env;
use std::process::Command;
use std::thread;
use std::time::Duration;
use sys_info;

// 1. Command Executor (Unchanged)
fn execute_os_command(command: &str) -> (String, String) {
    println!("Executing: {}", command);
    let (shell, arg) = if cfg!(target_os = "windows") {
        ("cmd", "/C")
    } else {
        ("sh", "-c")
    };
    match Command::new(shell).arg(arg).arg(command).output() {
        Ok(output) => (
            String::from_utf8_lossy(&output.stdout).to_string(),
            String::from_utf8_lossy(&output.stderr).to_string(),
        ),
        Err(e) => (String::new(), e.to_string()),
    }
}

// 2. Helper: Get System Stats
fn get_system_stats() -> serde_json::Value {
    let cpu_load = sys_info::loadavg().map(|l| l.one).unwrap_or(0.0);
    let mem = sys_info::mem_info()
        .map(|m| (m.total, m.free))
        .unwrap_or((0, 0));

    // Convert to easier format (MB)
    let total_ram_mb = mem.0 / 1024;
    let free_ram_mb = mem.1 / 1024;
    let used_ram_mb = total_ram_mb - free_ram_mb;

    json!({
        "cpuLoad": cpu_load,
        "ramTotal": total_ram_mb,
        "ramUsed": used_ram_mb,
        "os": std::env::consts::OS,
        "arch": std::env::consts::ARCH
    })
}

fn main() {
    dotenv().ok();
    println!("Axon Rust Agent Starting...");

    let server_url = env::var("SERVER_URL").expect("SERVER_URL must be set");
    let api_key = env::var("AGENT_API_KEY").expect("AGENT_API_KEY must be set");
    let agent_id = env::var("AGENT_ID").expect("AGENT_ID must be set");

    // 3. Callback (Unchanged)
    let callback = move |payload: Payload, socket: RawClient| match payload {
        Payload::Text(values) => {
            if let Some(data) = values.get(0) {
                let command = data["command"].as_str().unwrap_or("");
                let job_id = data["jobId"].as_str().unwrap_or("");

                if !command.is_empty() {
                    println!("--------------------------------------------------");
                    println!("Received Job {}: '{}'", job_id, command);
                    let (stdout, stderr) = execute_os_command(command);

                    if !stdout.is_empty() {
                        println!("STDOUT:\n{}", stdout);
                    }
                    if !stderr.is_empty() {
                        println!("STDERR:\n{}", stderr);
                    }

                    println!("--------------------------------------------------");
                    println!("Execution Finished. Sending results...");

                    let response = json!({
                        "jobId": job_id,
                        "stdout": stdout,
                        "stderr": stderr,
                        "exitCode": 0
                    });

                    if let Err(e) = socket.emit("command_result", response) {
                        eprintln!("Failed to emit result: {:?}", e);
                    }
                }
            }
        }
        _ => println!("Received unknown payload type"),
    };

    let auth_json = json!({ "agentId": agent_id, "apiKey": api_key });

    // 4. Connect Socket
    let socket_result = ClientBuilder::new(server_url)
        .namespace("/")
        .auth(auth_json)
        .on("connect", |_, _| println!("Connected to Axon Server!"))
        .on("execute_command", callback)
        .connect();

    match socket_result {
        Ok(socket) => {
            println!("Socket Loop Running.");

            // 5. HEARTBEAT THREAD (The Bonus Feature)
            // We clone the socket so the background thread can use it
            let heartbeat_socket = socket.clone();

            thread::spawn(move || {
                loop {
                    thread::sleep(Duration::from_secs(5)); // Every 5 seconds
                    let stats = get_system_stats();
                    if let Err(e) = heartbeat_socket.emit("heartbeat", stats) {
                        eprintln!("Heartbeat failed: {:?}", e);
                    }
                }
            });
            // Keep main thread alive
            loop {
                thread::sleep(Duration::from_secs(60));
            }
        }
        Err(e) => eprintln!("Connection Error: {:?}", e),
    }
}
