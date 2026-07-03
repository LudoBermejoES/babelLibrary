use std::path::PathBuf;

use clap::Parser;
use server::{app::build_app, db};

#[derive(Parser)]
struct Config {
    #[arg(long, env = "BABEL_DB", default_value = "data/books.sqlite")]
    db: PathBuf,

    #[arg(long, env = "BABEL_EPUB_DIR", default_value = "data/epubs")]
    epub_dir: PathBuf,

    #[arg(long, env = "BABEL_STATIC_DIR")]
    #[allow(dead_code)] // wired in task 7.1 (production static hosting)
    static_dir: Option<PathBuf>,

    #[arg(long, env = "PORT", default_value_t = 8080)]
    port: u16,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::parse();

    db::migrate(&config.db).expect("failed to migrate database");

    let app = build_app(&config.db, &config.epub_dir, config.static_dir.as_deref());

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("failed to bind {addr}: {e}"));

    tracing::info!(%addr, "babelLibrary server listening");
    axum::serve(listener, app).await.expect("server error");
}
