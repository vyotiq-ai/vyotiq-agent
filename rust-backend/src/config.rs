use serde::{Deserialize, Serialize};

/// Maximum allowed length for search queries (characters).
pub const MAX_SEARCH_QUERY_LENGTH: usize = 1000;

/// Canonical list of file extensions considered indexable and embeddable.
/// Both the Tantivy full-text indexer and the vector embedding pipeline
/// use this single list so they never diverge.
pub const SUPPORTED_EXTENSIONS: &[&str] = &[
    // JavaScript / TypeScript
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    // Systems / compiled
    "rs", "py", "go", "java", "c", "cpp", "h", "hpp",
    "cs", "rb", "php", "swift", "kt", "scala",
    // Web
    "html", "css", "scss", "less", "sass",
    // Data / config
    "json", "yaml", "yml", "toml", "xml",
    // Documentation
    "md", "mdx", "txt", "rst",
    // Query / schema
    "sql", "graphql", "gql",
    // Shell
    "sh", "bash", "zsh", "fish", "ps1", "bat", "cmd",
    // Build / container
    "dockerfile", "makefile",
    // Frontend frameworks
    "vue", "svelte", "astro",
    // Misc languages
    "lua", "zig", "nim", "dart", "elixir", "ex", "exs",
    "r", "jl", "clj", "cljs", "cljc", "erl", "hrl",
    // Infra / IPC
    "tf", "hcl", "proto",
    // Dotfiles / config
    "env", "ini", "cfg", "conf",
];

/// Check whether a file extension (without leading dot, lowercase) is in the
/// shared supported-extensions list.
pub fn is_supported_extension(ext: &str) -> bool {
    SUPPORTED_EXTENSIONS.contains(&ext)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub listen_addr: String,
    pub max_index_size_mb: usize,
    pub max_file_size_bytes: usize,
    pub watcher_debounce_ms: u64,
    pub index_batch_size: usize,
    pub data_dir: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let port = std::env::var("VYOTIQ_PORT")
            .unwrap_or_else(|_| "9721".to_string());

        let data_dir = std::env::var("VYOTIQ_DATA_DIR").unwrap_or_else(|_| {
            dirs::data_local_dir()
                .map(|d| d.join("vyotiq-backend").to_string_lossy().to_string())
                .unwrap_or_else(|| ".vyotiq-data".to_string())
        });

        Self {
            listen_addr: format!("127.0.0.1:{}", port),
            max_index_size_mb: std::env::var("VYOTIQ_MAX_INDEX_MB")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(512),
            max_file_size_bytes: std::env::var("VYOTIQ_MAX_FILE_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10 * 1024 * 1024), // 10MB
            watcher_debounce_ms: std::env::var("VYOTIQ_WATCHER_DEBOUNCE_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(300),
            index_batch_size: std::env::var("VYOTIQ_INDEX_BATCH_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(50),
            data_dir,
        }
    }
}
