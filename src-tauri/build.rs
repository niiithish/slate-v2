fn main() {
    tauri_build::build();
    embed_env_local();
}

fn embed_env_local() {
    for path in ["../.env.local", ".env.local"] {
        if !std::path::Path::new(path).exists() {
            continue;
        }
        println!("cargo:rerun-if-changed={path}");
        if let Ok(iter) = dotenvy::from_filename_iter(path) {
            for item in iter.flatten() {
                if item.0 == "DATABASE_URL" || item.0 == "DATABASE_TOKEN" {
                    println!("cargo:rustc-env={}={}", item.0, item.1);
                }
            }
        }
        break;
    }
}
