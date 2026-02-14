/// Shared language detection utility.
///
/// Consolidated from 4 duplicate implementations across
/// indexer.rs, watcher.rs, routes/files.rs, and routes/search.rs.
/// Provides the most comprehensive language detection covering all supported extensions.

/// Detect programming language from file extension.
/// Returns a static string identifier for the language.
pub fn detect_language(ext: &str) -> &'static str {
    match ext.to_lowercase().as_str() {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "rs" => "rust",
        "py" | "pyi" | "pyw" => "python",
        "go" => "go",
        "java" => "java",
        "c" | "h" => "c",
        "cpp" | "hpp" | "cc" | "cxx" | "hxx" => "cpp",
        "cs" => "csharp",
        "rb" | "rake" => "ruby",
        "php" => "php",
        "swift" => "swift",
        "kt" | "kts" => "kotlin",
        "scala" | "sc" => "scala",
        "html" | "htm" => "html",
        "css" => "css",
        "scss" | "sass" | "less" => "scss",
        "json" | "jsonc" => "json",
        "yaml" | "yml" => "yaml",
        "toml" => "toml",
        "xml" | "xsl" | "xslt" => "xml",
        "md" | "mdx" | "rst" => "markdown",
        "sql" => "sql",
        "graphql" | "gql" => "graphql",
        "sh" | "bash" | "zsh" | "fish" => "shell",
        "ps1" | "psm1" | "psd1" => "powershell",
        "bat" | "cmd" => "batch",
        "vue" => "vue",
        "svelte" => "svelte",
        "astro" => "astro",
        "lua" => "lua",
        "zig" => "zig",
        "nim" => "nim",
        "dart" => "dart",
        "elixir" | "ex" | "exs" => "elixir",
        "erl" | "hrl" => "erlang",
        "r" => "r",
        "jl" => "julia",
        "clj" | "cljs" | "cljc" => "clojure",
        "tf" | "hcl" => "hcl",
        "proto" => "protobuf",
        "dockerfile" => "dockerfile",
        "makefile" => "makefile",
        "ini" | "cfg" | "conf" => "ini",
        "env" => "dotenv",
        "txt" => "plaintext",
        _ => "plaintext",
    }
}
