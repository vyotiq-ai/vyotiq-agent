use crate::error::{AppError, AppResult};
use chrono::{DateTime, Utc};
use dashmap::DashMap;
use serde::{Deserialize, Serialize, Serializer};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    /// Primary path field (also exposed as `root_path` in JSON for frontend compat)
    #[serde(alias = "root_path")]
    pub path: String,
    pub created_at: DateTime<Utc>,
    pub last_accessed: DateTime<Utc>,
    pub is_active: bool,
    pub indexed: bool,
    pub total_files: usize,
    pub total_size_bytes: u64,
}

impl Workspace {
    pub fn root_path(&self) -> &str {
        &self.path
    }
}

/// Custom Serialize: emits both `path` and `root_path` so the frontend
/// can consume via either key without breaking.
impl serde::Serialize for Workspace {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut s = serializer.serialize_struct("Workspace", 10)?;
        s.serialize_field("id", &self.id)?;
        s.serialize_field("name", &self.name)?;
        s.serialize_field("path", &self.path)?;
        s.serialize_field("root_path", &self.path)?;
        s.serialize_field("created_at", &self.created_at)?;
        s.serialize_field("last_accessed", &self.last_accessed)?;
        s.serialize_field("is_active", &self.is_active)?;
        s.serialize_field("indexed", &self.indexed)?;
        s.serialize_field("total_files", &self.total_files)?;
        s.serialize_field("total_size_bytes", &self.total_size_bytes)?;
        s.end()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified: Option<DateTime<Utc>>,
    pub created: Option<DateTime<Utc>>,
    pub extension: Option<String>,
    pub children_count: Option<usize>,
    pub is_hidden: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStats {
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub modified: Option<DateTime<Utc>>,
    pub created: Option<DateTime<Utc>>,
    pub accessed: Option<DateTime<Utc>>,
    pub permissions: Option<String>,
    pub extension: Option<String>,
}

pub struct WorkspaceManager {
    workspaces: DashMap<String, Workspace>,
    data_dir: PathBuf,
    /// User-provided exclude patterns forwarded from app settings.
    user_exclude_patterns: Vec<String>,
}

impl WorkspaceManager {
    pub fn new(data_dir: PathBuf, user_exclude_patterns: Vec<String>) -> Self {
        let manager = Self {
            workspaces: DashMap::new(),
            data_dir,
            user_exclude_patterns,
        };
        // Load persisted workspaces on startup
        if let Ok(content) = std::fs::read_to_string(manager.workspaces_file()) {
            if let Ok(workspaces) = serde_json::from_str::<Vec<Workspace>>(&content) {
                for ws in workspaces {
                    manager.workspaces.insert(ws.id.clone(), ws);
                }
            }
        }
        manager
    }

    fn workspaces_file(&self) -> PathBuf {
        self.data_dir.join("workspaces.json")
    }

    fn persist(&self) -> AppResult<()> {
        let workspaces: Vec<Workspace> = self
            .workspaces
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        let json = serde_json::to_string_pretty(&workspaces)?;
        std::fs::create_dir_all(&self.data_dir)?;
        // Atomic write: write to temp file then rename to prevent corruption on crash
        let target = self.workspaces_file();
        let tmp = target.with_extension("json.tmp");
        std::fs::write(&tmp, &json)?;
        std::fs::rename(&tmp, &target)?;
        Ok(())
    }

    pub fn create_workspace(&self, name: String, path: String) -> AppResult<Workspace> {
        let canonical = dunce::canonicalize(&path).map_err(|_| {
            AppError::FileNotFound(format!("Path does not exist: {}", path))
        })?;

        // Check for duplicate path
        for entry in self.workspaces.iter() {
            if dunce::canonicalize(&entry.value().path)
                .map(|p| p == canonical)
                .unwrap_or(false)
            {
                return Err(AppError::WorkspaceAlreadyExists(path.clone()));
            }
        }

        let workspace = Workspace {
            id: Uuid::new_v4().to_string(),
            name,
            path: canonical.to_string_lossy().to_string(),
            created_at: Utc::now(),
            last_accessed: Utc::now(),
            is_active: false,
            indexed: false,
            total_files: 0,
            total_size_bytes: 0,
        };

        self.workspaces.insert(workspace.id.clone(), workspace.clone());
        self.persist()?;
        Ok(workspace)
    }

    pub fn get_workspace(&self, id: &str) -> AppResult<Workspace> {
        self.workspaces
            .get(id)
            .map(|entry| entry.value().clone())
            .ok_or_else(|| AppError::WorkspaceNotFound(id.to_string()))
    }

    pub fn list_workspaces(&self) -> Vec<Workspace> {
        let mut workspaces: Vec<Workspace> = self
            .workspaces
            .iter()
            .map(|entry| entry.value().clone())
            .collect();
        workspaces.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
        workspaces
    }

    pub fn remove_workspace(&self, id: &str) -> AppResult<()> {
        self.workspaces
            .remove(id)
            .ok_or_else(|| AppError::WorkspaceNotFound(id.to_string()))?;
        self.persist()?;
        Ok(())
    }

    pub fn activate_workspace(&self, id: &str) -> AppResult<Workspace> {
        // Deactivate all
        for mut entry in self.workspaces.iter_mut() {
            entry.value_mut().is_active = false;
        }
        // Activate selected
        let mut ws = self
            .workspaces
            .get_mut(id)
            .ok_or_else(|| AppError::WorkspaceNotFound(id.to_string()))?;
        ws.is_active = true;
        ws.last_accessed = Utc::now();
        let result = ws.clone();
        drop(ws);
        self.persist()?;
        Ok(result)
    }

    pub fn update_workspace_stats(
        &self,
        id: &str,
        total_files: usize,
        total_size_bytes: u64,
        indexed: bool,
    ) -> AppResult<()> {
        let mut ws = self
            .workspaces
            .get_mut(id)
            .ok_or_else(|| AppError::WorkspaceNotFound(id.to_string()))?;
        ws.total_files = total_files;
        ws.total_size_bytes = total_size_bytes;
        ws.indexed = indexed;
        drop(ws);
        self.persist()?;
        Ok(())
    }

    pub fn validate_path(&self, workspace_id: &str, file_path: &str) -> AppResult<PathBuf> {
        let ws = self.get_workspace(workspace_id)?;
        let ws_path = PathBuf::from(&ws.path);
        let full_path = ws_path.join(file_path);

        let canonical = dunce::canonicalize(&full_path)
            .or_else(|_| {
                // For files that don't exist yet, validate parent
                if let Some(parent) = full_path.parent() {
                    dunce::canonicalize(parent).map(|p| p.join(full_path.file_name().unwrap_or_default()))
                } else {
                    Err(std::io::Error::new(
                        std::io::ErrorKind::NotFound,
                        "Invalid path",
                    ))
                }
            })
            .map_err(|_| AppError::FileNotFound(file_path.to_string()))?;

        let ws_canonical = dunce::canonicalize(&ws_path)
            .map_err(|_| AppError::WorkspaceNotFound(workspace_id.to_string()))?;

        if !canonical.starts_with(&ws_canonical) {
            return Err(AppError::PathNotAllowed(format!(
                "Path '{}' is outside workspace",
                file_path
            )));
        }

        Ok(canonical)
    }

    /// List directory contents with filtering/sorting options
    pub fn list_directory(
        &self,
        workspace_id: &str,
        relative_path: &str,
        recursive: bool,
        show_hidden: bool,
        max_depth: usize,
    ) -> AppResult<Vec<FileEntry>> {
        let ws = self.get_workspace(workspace_id)?;
        let base_path = PathBuf::from(&ws.path);
        let target_path = if relative_path.is_empty() || relative_path == "." {
            base_path.clone()
        } else {
            base_path.join(relative_path)
        };

        if !target_path.exists() {
            return Err(AppError::FileNotFound(relative_path.to_string()));
        }

        let mut entries = Vec::new();
        self.collect_entries(
            &base_path,
            &target_path,
            recursive,
            show_hidden,
            max_depth,
            0,
            &mut entries,
        )?;

        // Sort: dirs first, then alphabetical
        entries.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        Ok(entries)
    }

    fn collect_entries(
        &self,
        base_path: &Path,
        dir_path: &Path,
        recursive: bool,
        show_hidden: bool,
        max_depth: usize,
        current_depth: usize,
        entries: &mut Vec<FileEntry>,
    ) -> AppResult<()> {
        if current_depth > max_depth {
            return Ok(());
        }

        let read_dir = std::fs::read_dir(dir_path)?;

        for entry_result in read_dir {
            let entry = entry_result?;
            let metadata = entry.metadata()?;
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files unless requested
            if !show_hidden && name.starts_with('.') {
                continue;
            }

            // Skip common exclude patterns
            if self.should_exclude(&name) {
                continue;
            }

            let path = entry.path();
            let relative = path
                .strip_prefix(base_path)
                .unwrap_or(&path)
                .to_string_lossy()
                .replace('\\', "/");

            let is_dir = metadata.is_dir();
            let children_count = if is_dir {
                std::fs::read_dir(&path).map(|rd| rd.count()).ok()
            } else {
                None
            };

            let file_entry = FileEntry {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                relative_path: relative,
                is_dir,
                is_symlink: metadata.is_symlink(),
                size: metadata.len(),
                modified: metadata.modified().ok().map(DateTime::from),
                created: metadata.created().ok().map(DateTime::from),
                extension: path.extension().map(|e| e.to_string_lossy().to_string()),
                children_count,
                is_hidden: name.starts_with('.'),
            };

            entries.push(file_entry);

            if recursive && is_dir {
                self.collect_entries(
                    base_path,
                    &path,
                    recursive,
                    show_hidden,
                    max_depth,
                    current_depth + 1,
                    entries,
                )?;
            }
        }

        Ok(())
    }

    fn should_exclude(&self, name: &str) -> bool {
        // Delegates to shared config to stay in sync with IndexManager::is_build_or_output_dir()
        crate::config::is_excluded_directory(name)
            || crate::config::matches_user_exclude_patterns(name, &self.user_exclude_patterns)
    }

    pub fn get_file_stats(&self, workspace_id: &str, relative_path: &str) -> AppResult<FileStats> {
        let full_path = self.validate_path(workspace_id, relative_path)?;
        let metadata = std::fs::metadata(&full_path)?;

        Ok(FileStats {
            path: relative_path.to_string(),
            size: metadata.len(),
            is_dir: metadata.is_dir(),
            is_file: metadata.is_file(),
            is_symlink: metadata.file_type().is_symlink(),
            modified: metadata.modified().ok().map(DateTime::from),
            created: metadata.created().ok().map(DateTime::from),
            accessed: metadata.accessed().ok().map(DateTime::from),
            permissions: None,
            extension: Path::new(relative_path)
                .extension()
                .map(|e| e.to_string_lossy().to_string()),
        })
    }
}
