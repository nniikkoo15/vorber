use std::fs;
use std::path::Path;
use std::process::Command as SysCommand;
use tauri::Emitter;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct ExportJob {
    file_path: String,
    bank: String,
    slot: u8,
    layer: String,    // "L0".."L3", "R0".."R3"
    trim_start: f64,
    trim_length: f64,
    stereo_mode: String, // "sum" | "split-L" | "split-R"
    channels: u32,
}

#[derive(serde::Serialize)]
struct ExportResult {
    completed: usize,
    skipped: usize,
    errors: Vec<String>,
    manifest_path: Option<String>,
}

fn find_ffmpeg() -> Option<String> {
    // Common install locations (checked before spawning a process)
    for path in [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ] {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    // Fall back to PATH lookup
    let which = if cfg!(target_os = "windows") { "where" } else { "which" };
    if let Ok(out) = SysCommand::new(which).arg("ffmpeg").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    None
}

fn wav_path(output_dir: &str, bank: &str, slot: u8, layer: &str) -> std::path::PathBuf {
    let chan = &layer[..1]; // "L" or "R"
    let num = &layer[1..];  // "0".."3"
    Path::new(output_dir)
        .join(bank)
        .join(format!("{}_SLOT{}_{}{}.wav", bank, slot, chan, num))
}

#[tauri::command]
fn check_export_conflicts(jobs: Vec<ExportJob>, output_dir: String) -> Vec<String> {
    jobs.iter()
        .filter_map(|j| {
            let p = wav_path(&output_dir, &j.bank, j.slot, &j.layer);
            if p.exists() {
                Some(
                    p.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                )
            } else {
                None
            }
        })
        .collect()
}

#[tauri::command]
async fn export_cells(
    app: tauri::AppHandle,
    jobs: Vec<ExportJob>,
    output_dir: String,
    overwrite: bool,
) -> Result<ExportResult, String> {
    let ffmpeg = find_ffmpeg().ok_or_else(|| {
        "ffmpeg not found — install with: brew install ffmpeg".to_string()
    })?;

    let total = jobs.len();
    let mut completed = 0usize;
    let mut skipped = 0usize;
    let mut errors: Vec<String> = Vec::new();
    let mut manifest_rows = vec![
        "source_path,bank,slot,layer,trim_start,trim_length,stereo_mode,output_path".to_string(),
    ];

    for (i, job) in jobs.iter().enumerate() {
        let out = wav_path(&output_dir, &job.bank, job.slot, &job.layer);
        let filename = out
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Skip existing when overwrite = false
        if !overwrite && out.exists() {
            skipped += 1;
            let _ = app.emit(
                "export_progress",
                serde_json::json!({
                    "index": i + 1, "total": total,
                    "status": "skipped", "file": &filename
                }),
            );
            continue;
        }

        // Ensure bank sub-directory exists
        if let Some(parent) = out.parent() {
            if let Err(e) = fs::create_dir_all(parent) {
                errors.push(format!("{}: {}", filename, e));
                let _ = app.emit(
                    "export_progress",
                    serde_json::json!({
                        "index": i + 1, "total": total,
                        "status": "error", "file": &filename
                    }),
                );
                continue;
            }
        }

        // Build -af filter chain.
        // aformat at the end locks channel_layout=mono before encoding — this prevents
        // ffmpeg from writing a WAVE_FORMAT_EXTENSIBLE header (tag 0xFFFE) instead of
        // plain WAVE_FORMAT_PCM (tag 0x0001), which many hardware samplers reject.
        let fade = 0.005_f64;
        let fade_out_st = (job.trim_length - fade).max(0.0);
        let aformat = "aformat=sample_fmts=s16:channel_layouts=mono:sample_rates=48000";
        let af = if job.channels <= 1 {
            format!("afade=t=in:st=0:d={fade},afade=t=out:st={fade_out_st}:d={fade},{aformat}")
        } else {
            let pan = match job.stereo_mode.as_str() {
                "split-L" | "left-only"  => "pan=mono|c0=FL",
                "split-R" | "right-only" => "pan=mono|c0=FR",
                _                        => "pan=mono|c0=0.5*FL+0.5*FR",
            };
            format!("{pan},afade=t=in:st=0:d={fade},afade=t=out:st={fade_out_st}:d={fade},{aformat}")
        };

        let run = SysCommand::new(&ffmpeg)
            .args([
                "-y",
                "-ss", &format!("{:.6}", job.trim_start),
                "-t",  &format!("{:.6}", job.trim_length),
                "-i",  &job.file_path,
                "-af", &af,
                "-f", "wav",        // explicit WAV container (no RF64, no BWF extensions)
                "-rf64", "never",   // keep standard RIFF even if file > 4 GB limit
                "-fflags", "+bitexact", // suppress ffmpeg encoder identification tag
                "-map_metadata", "-1", // strip all input metadata (LIST INFO from Splice etc.)
                "-c:a", "pcm_s16le",
                out.to_str().unwrap_or(""),
            ])
            .output();

        match run {
            Ok(o) if o.status.success() => {
                completed += 1;
                manifest_rows.push(format!(
                    "\"{}\",{},{},{},{:.3},{:.3},{},\"{}\"",
                    job.file_path.replace('"', "\"\""),
                    job.bank,
                    job.slot,
                    job.layer,
                    job.trim_start,
                    job.trim_length,
                    job.stereo_mode,
                    out.display().to_string().replace('"', "\"\""),
                ));
                let _ = app.emit(
                    "export_progress",
                    serde_json::json!({
                        "index": i + 1, "total": total,
                        "status": "done", "file": &filename
                    }),
                );
            }
            Ok(o) => {
                let stderr = String::from_utf8_lossy(&o.stderr);
                let detail = stderr.lines().last().unwrap_or("unknown error");
                errors.push(format!("{}: {}", filename, detail));
                let _ = app.emit(
                    "export_progress",
                    serde_json::json!({
                        "index": i + 1, "total": total,
                        "status": "error", "file": &filename
                    }),
                );
            }
            Err(e) => {
                errors.push(format!("{}: could not run ffmpeg: {}", filename, e));
                let _ = app.emit(
                    "export_progress",
                    serde_json::json!({
                        "index": i + 1, "total": total,
                        "status": "error", "file": &filename
                    }),
                );
            }
        }
    }

    // Write manifest.csv when at least one file was exported
    let manifest_path = if completed > 0 {
        let mp = Path::new(&output_dir).join("manifest.csv");
        let _ = fs::write(&mp, manifest_rows.join("\n") + "\n");
        Some(mp.to_string_lossy().to_string())
    } else {
        None
    };

    Ok(ExportResult {
        completed,
        skipped,
        errors,
        manifest_path,
    })
}

#[tauri::command]
fn read_project(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_project(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn check_files_exist(paths: Vec<String>) -> Vec<String> {
    paths.into_iter().filter(|p| !Path::new(p).exists()).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            check_export_conflicts,
            export_cells,
            read_project,
            write_project,
            check_files_exist
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
