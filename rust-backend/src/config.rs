use serde::{Deserialize, Serialize};

/// Maximum allowed length for search queries (characters).
pub const MAX_SEARCH_QUERY_LENGTH: usize = 1000;

/// Canonical list of file extensions considered indexable.
/// The Tantivy full-text indexer uses this list.
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

/// Canonical list of directories to exclude from indexing, file walking, and tree display.
/// Both `IndexManager::is_build_or_output_dir` and `WorkspaceManager::should_exclude`
/// reference this single list so they never diverge.
pub const EXCLUDED_DIRECTORY_NAMES: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    ".output",
    ".vite",
    ".turbo",
    ".svelte-kit",
    ".parcel-cache",
    "__pycache__",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "coverage",
    ".nyc_output",
    ".cache",
    "vendor",
    ".gradle",
    ".maven",
    ".terraform",
    ".eggs",
    ".vscode",
    ".idea",
    ".angular",
    ".expo",
    ".vercel",
    ".netlify",
    ".serverless",
    ".aws-sam",
    "__generated__",
    ".cargo",
];

/// Check whether a directory name matches an excluded pattern.
/// Also handles suffix-based patterns like `*.egg-info`.
pub fn is_excluded_directory(name: &str) -> bool {
    EXCLUDED_DIRECTORY_NAMES.contains(&name) || name.ends_with(".egg-info")
}

/// Check whether a directory/file name matches any user-provided exclusion pattern.
/// Supports simple glob-like matching: `*` prefix/suffix wildcards and exact name matches.
pub fn matches_user_exclude_patterns(name: &str, patterns: &[String]) -> bool {
    let name_lower = name.to_lowercase();
    for pattern in patterns {
        let p = pattern.trim().to_lowercase();
        if p.is_empty() {
            continue;
        }
        // Strip trailing /** or /* for directory-level matching
        let dir_pattern = p.trim_end_matches("/**").trim_end_matches("/*");
        // Exact match
        if name_lower == dir_pattern {
            return true;
        }
        // Suffix wildcard: *.ext
        if let Some(suffix) = p.strip_prefix('*') {
            if name_lower.ends_with(&suffix) {
                return true;
            }
        }
        // Prefix wildcard: prefix*
        if let Some(prefix) = p.strip_suffix('*') {
            if name_lower.starts_with(&prefix) {
                return true;
            }
        }
    }
    false
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub listen_addr: String,
    pub max_index_size_mb: usize,
    pub max_file_size_bytes: usize,
    pub watcher_debounce_ms: u64,
    pub index_batch_size: usize,
    pub data_dir: String,
    /// Maximum number of files to index per workspace.
    /// Prevents unbounded memory growth for very large monorepos.
    pub max_indexed_files: usize,
    /// Additional glob patterns of files/directories to exclude from indexing.
    /// Forwarded from App settings via VYOTIQ_EXCLUDE_PATTERNS env var (comma-separated).
    pub exclude_patterns: Vec<String>,
    /// Glob patterns of files to include (empty = all files).
    /// Forwarded from App settings via VYOTIQ_INCLUDE_PATTERNS env var (comma-separated).
    pub include_patterns: Vec<String>,
    /// Whether file watching is enabled. When false, no file watchers are started.
    /// Forwarded from App settings via VYOTIQ_ENABLE_FILE_WATCHER env var.
    pub enable_file_watcher: bool,
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
            // MEMORY FIX: Reduced default from 10MB to 2MB for indexing.
            // Files larger than 2MB are typically generated/minified and not useful for code search.
            max_file_size_bytes: std::env::var("VYOTIQ_MAX_FILE_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2 * 1024 * 1024), // 2MB
            watcher_debounce_ms: std::env::var("VYOTIQ_WATCHER_DEBOUNCE_MS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(500), // Increased from 300ms to 500ms for less CPU churn
            index_batch_size: std::env::var("VYOTIQ_INDEX_BATCH_SIZE")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(50),
            data_dir,
            max_indexed_files: std::env::var("VYOTIQ_MAX_INDEXED_FILES")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(50_000), // 50k files max per workspace
            exclude_patterns: std::env::var("VYOTIQ_EXCLUDE_PATTERNS")
                .ok()
                .map(|v| v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
                .unwrap_or_default(),
            include_patterns: std::env::var("VYOTIQ_INCLUDE_PATTERNS")
                .ok()
                .map(|v| v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
                .unwrap_or_default(),
            enable_file_watcher: std::env::var("VYOTIQ_ENABLE_FILE_WATCHER")
                .ok()
                .map(|v| v != "0" && v.to_lowercase() != "false")
                .unwrap_or(true),
        }
    }
}
