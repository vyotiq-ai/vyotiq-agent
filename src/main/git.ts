import simpleGit, { SimpleGit, StatusResult, LogResult } from 'simple-git';
import { createLogger } from './logger';
import type { GitCommit as SharedGitCommit } from '../shared/types';

const logger = createLogger('GitService');

/**
 * Git status for a single file
 */
export interface GitFileStatus {
  path: string;
  index: string;
  workingDir: string;
  staged: boolean;
  conflicted: boolean;
}

/**
 * Git repository status
 */
export interface GitStatus {
  current: string | null;
  tracking: string | null;
  detached: boolean;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  staged: string[];
  modified: string[];
  deleted: string[];
  created: string[];
  renamed: string[];
  conflicted: string[];
  not_added: string[];
  isClean: boolean;
}

/**
 * Git commit log entry
 */
export interface GitLogEntry {
  hash: string;
  abbreviated_hash: string;
  author_name: string;
  author_email: string;
  date: string;
  message: string;
  body: string;
  refs: string;
}

/**
 * Git branch information
 */
export interface GitBranch {
  name: string;
  current: boolean;
  commit: string;
  label: string;
  linkedWorkTree?: boolean;
}

/**
 * Git remote information
 */
export interface GitRemote {
  name: string;
  refs: {
    fetch: string;
    push: string;
  };
}

/**
 * Git stash entry
 */
export interface GitStashEntry {
  index: number;
  date: string;
  message: string;
  hash: string;
}

/**
 * Git blame line information
 */
export interface GitBlameLine {
  hash: string;
  author: string;
  date: string;
  line: number;
  content: string;
}

/**
 * Git Service class for repository operations
 */
class GitService {
  private git: SimpleGit | null = null;
  private _isRepo = false;

  private isUnbornRepoError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /Not a valid object name HEAD|does not have any commits yet|unknown revision|bad revision|ambiguous argument 'HEAD'|Needed a single revision/i.test(
      message
    );
  }

  private isMissingIdentityError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /Please tell me who you are|unable to auto-detect email address|user\.name|user\.email/i.test(
      message
    );
  }

  private async hasCommits(): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      await this.git.raw(['rev-parse', '--verify', 'HEAD']);
      return true;
    } catch (error) {
      // Common/expected for new repos with no commits. Avoid spamming logs in that case.
      if (!this.isUnbornRepoError(error)) {
        logger.debug('Failed to verify HEAD', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return false;
    }
  }

  private async buildCommit(hash: string): Promise<SharedGitCommit | null> {
    if (!this.git || !this._isRepo) return null;

    try {
      const metaRaw = await this.git.raw([
        'show',
        '-s',
        '--format=%H%n%h%n%an%n%ae%n%ai',
        hash,
      ]);
      const metaLines = metaRaw.trimEnd().split(/\r?\n/);
      const fullHash = metaLines[0] || hash;
      const shortHash = metaLines[1] || fullHash.substring(0, 7);
      const author = metaLines[2] || '';
      const authorEmail = metaLines[3] || '';
      const date = metaLines[4] || '';

      const fullMessage = await this.git.raw(['show', '-s', '--format=%B', fullHash]);
      const messageLines = fullMessage.replace(/\r\n/g, '\n').split('\n');
      const message = (messageLines.shift() ?? '').trimEnd();
      const body = messageLines.join('\n').trim() || undefined;

      const parentsRaw = await this.git.raw(['rev-list', '--parents', '-n', '1', fullHash]);
      const parentsParts = parentsRaw.trim().split(/\s+/);
      const parents = parentsParts.slice(1);

      return {
        hash: fullHash,
        shortHash,
        author,
        authorEmail,
        date,
        message,
        body,
        parents,
      };
    } catch (error) {
      logger.debug('Failed to build commit details', {
        hash,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Initialize git service with a repository path
   */
  async init(repoPath: string): Promise<void> {
    try {
      this.git = simpleGit(repoPath);
      this._isRepo = await this.git.checkIsRepo();
      logger.info('Git service initialized', { repoPath, isRepo: this._isRepo });
    } catch (error) {
      logger.error('Failed to initialize git service', { 
        repoPath, 
        error: error instanceof Error ? error.message : String(error) 
      });
      this._isRepo = false;
    }
  }

  /**
   * Check if current path is a git repository
   */
  isRepo(): boolean {
    return this._isRepo;
  }

  /**
   * Get the current repository status
   */
  async status(): Promise<GitStatus | null> {
    if (!this.git || !this._isRepo) {
      return null;
    }

    try {
      const status: StatusResult = await this.git.status();
      
      const files: GitFileStatus[] = status.files.map(file => ({
        path: file.path,
        index: file.index,
        workingDir: file.working_dir,
        staged: file.index !== ' ' && file.index !== '?',
        conflicted: status.conflicted.includes(file.path),
      }));

      return {
        current: status.current,
        tracking: status.tracking,
        detached: status.detached,
        ahead: status.ahead,
        behind: status.behind,
        files,
        staged: status.staged,
        modified: status.modified,
        deleted: status.deleted,
        created: status.created,
        renamed: status.renamed.map(r => r.from),
        conflicted: status.conflicted,
        not_added: status.not_added,
        isClean: status.isClean(),
      };
    } catch (error) {
      logger.error('Failed to get git status', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }

  /**
   * Get current branch name
   */
  async currentBranch(): Promise<string | null> {
    if (!this.git || !this._isRepo) return null;

    try {
      const status = await this.git.status();
      return status.current;
    } catch (error) {
      logger.error('Failed to get current branch', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }

  /**
   * Stage files
   */
  async stage(paths: string[]): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      await this.git.add(paths);
      logger.info('Files staged', { paths });
      return true;
    } catch (error) {
      logger.error('Failed to stage files', { 
        paths, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Unstage files
   */
  async unstage(paths: string[]): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      if (await this.hasCommits()) {
        await this.git.reset(['HEAD', '--', ...paths]);
      } else {
        // Unborn HEAD (no commits yet): use rm --cached to unstage initial adds.
        try {
          await this.git.raw(['rm', '--cached', '--', ...paths]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          // Directory / recursive path case
          if (/is a directory|not removing/i.test(message)) {
            await this.git.raw(['rm', '--cached', '-r', '--', ...paths]);
          } else if (/pathspec.*did not match/i.test(message)) {
            // Nothing staged for these paths
            return true;
          } else {
            throw error;
          }
        }
      }
      logger.info('Files unstaged', { paths });
      return true;
    } catch (error) {
      // Expected failure mode when HEAD doesn't exist / refs are invalid.
      if (this.isUnbornRepoError(error)) {
        logger.debug('Unstage skipped (repo has no commits yet)', {
          paths,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }

      logger.error('Failed to unstage files', {
        paths,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Discard changes in a file
   */
  async discard(filePath: string): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      await this.git.checkout(['--', filePath]);
      logger.info('Changes discarded', { filePath });
      return true;
    } catch (error) {
      logger.error('Failed to discard changes', { 
        filePath, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Commit staged changes
   */
  async commit(
    message: string,
    options?: { amend?: boolean; all?: boolean }
  ): Promise<{ success: boolean; commit?: SharedGitCommit; error?: string }> {
    if (!this.git || !this._isRepo) {
      return { success: false, error: 'Git not initialized or not a repository' };
    }

    try {
      const commitOptions: string[] = [];
      if (options?.amend) commitOptions.push('--amend');
      if (options?.all) commitOptions.push('-a');
      
      const result = await this.git.commit(message, commitOptions);
      logger.info('Commit created', { 
        hash: result.commit, 
        summary: result.summary 
      });
      const commit = await this.buildCommit(result.commit);
      return {
        success: true,
        commit: commit ?? undefined,
      };
    } catch (error) {
      if (this.isMissingIdentityError(error)) {
        return {
          success: false,
          error:
            'Git author identity is not configured. Set user.name and user.email, e.g.\n' +
            '  git config --global user.name "Your Name"\n' +
            '  git config --global user.email "you@example.com"',
        };
      }

      logger.error('Failed to commit', {
        message,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get commit log
   */
  async log(options?: { maxCount?: number; skip?: number; filePath?: string }): Promise<GitLogEntry[]> {
    if (!this.git || !this._isRepo) return [];

    try {
      if (!(await this.hasCommits())) return [];

      const logOptions: Record<string, unknown> = {
        format: {
          hash: '%H',
          abbreviated_hash: '%h',
          author_name: '%an',
          author_email: '%ae',
          date: '%ai',
          message: '%s',
          body: '%b',
          refs: '%D',
        },
      };

      if (options?.maxCount) logOptions.maxCount = options.maxCount;
      if (options?.skip) logOptions['--skip'] = options.skip;
      if (options?.filePath) logOptions.file = options.filePath;

      const result: LogResult = await this.git.log(logOptions);
      
      return result.all.map(entry => ({
        hash: entry.hash,
        abbreviated_hash: (entry as unknown as Record<string, string>).abbreviated_hash || entry.hash.substring(0, 7),
        author_name: entry.author_name,
        author_email: entry.author_email,
        date: entry.date,
        message: entry.message,
        body: entry.body,
        refs: entry.refs,
      }));
    } catch (error) {
      if (this.isUnbornRepoError(error)) {
        logger.debug('Log skipped (repo has no commits yet)', {
          options,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }

      logger.error('Failed to get log', {
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get list of branches
   */
  async branches(all?: boolean): Promise<GitBranch[]> {
    if (!this.git || !this._isRepo) return [];

    try {
      const result = await this.git.branch(all ? ['-a'] : []);
      
      return Object.entries(result.branches).map(([name, branch]) => ({
        name,
        current: branch.current,
        commit: branch.commit,
        label: branch.label,
        linkedWorkTree: branch.linkedWorkTree,
      }));
    } catch (error) {
      logger.error('Failed to get branches', { 
        all, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(name: string, startPoint?: string): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const args = startPoint ? [name, startPoint] : [name];
      await this.git.branch(args);
      logger.info('Branch created', { name, startPoint });
      return true;
    } catch (error) {
      logger.error('Failed to create branch', { 
        name, 
        startPoint, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(name: string, force?: boolean): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const flag = force ? '-D' : '-d';
      await this.git.branch([flag, name]);
      logger.info('Branch deleted', { name, force });
      return true;
    } catch (error) {
      logger.error('Failed to delete branch', { 
        name, 
        force, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Checkout a branch or ref
   */
  async checkout(ref: string, options?: { create?: boolean }): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const args = options?.create ? ['-b', ref] : [ref];
      await this.git.checkout(args);
      logger.info('Checkout successful', { ref, options });
      return true;
    } catch (error) {
      logger.error('Failed to checkout', { 
        ref, 
        options, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Get list of remotes
   */
  async remotes(): Promise<GitRemote[]> {
    if (!this.git || !this._isRepo) return [];

    try {
      const result = await this.git.getRemotes(true);
      return result.map(remote => ({
        name: remote.name,
        refs: {
          fetch: remote.refs.fetch || '',
          push: remote.refs.push || '',
        },
      }));
    } catch (error) {
      logger.error('Failed to get remotes', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  }

  /**
   * Fetch from remote
   */
  async fetch(remote?: string, prune?: boolean): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const args: string[] = [];
      if (remote) args.push(remote);
      if (prune) args.push('--prune');
      
      await this.git.fetch(args);
      logger.info('Fetch successful', { remote, prune });
      return true;
    } catch (error) {
      logger.error('Failed to fetch', { 
        remote, 
        prune, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Pull from remote
   */
  async pull(remote?: string, branch?: string): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      await this.git.pull(remote, branch);
      logger.info('Pull successful', { remote, branch });
      return true;
    } catch (error) {
      logger.error('Failed to pull', { 
        remote, 
        branch, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Push to remote
   */
  async push(remote?: string, branch?: string, options?: { force?: boolean; setUpstream?: boolean }): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const args: string[] = [];
      if (options?.force) args.push('--force');
      if (options?.setUpstream) args.push('-u');
      if (remote) args.push(remote);
      if (branch) args.push(branch);
      
      await this.git.push(args);
      logger.info('Push successful', { remote, branch, options });
      return true;
    } catch (error) {
      logger.error('Failed to push', { 
        remote, 
        branch, 
        options, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Stash changes
   */
  async stash(message?: string): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const args = message ? ['push', '-m', message] : ['push'];
      await this.git.stash(args);
      logger.info('Stash created', { message });
      return true;
    } catch (error) {
      logger.error('Failed to stash', { 
        message, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Pop stash
   */
  async stashPop(index?: number): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const args = index !== undefined ? ['pop', `stash@{${index}}`] : ['pop'];
      await this.git.stash(args);
      logger.info('Stash popped', { index });
      return true;
    } catch (error) {
      logger.error('Failed to pop stash', { 
        index, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Apply stash without removing it
   */
  async stashApply(index?: number): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const args = index !== undefined ? ['apply', `stash@{${index}}`] : ['apply'];
      await this.git.stash(args);
      logger.info('Stash applied', { index });
      return true;
    } catch (error) {
      logger.error('Failed to apply stash', { 
        index, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Drop a stash entry
   */
  async stashDrop(index?: number): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      const args = index !== undefined ? ['drop', `stash@{${index}}`] : ['drop'];
      await this.git.stash(args);
      logger.info('Stash dropped', { index });
      return true;
    } catch (error) {
      logger.error('Failed to drop stash', { 
        index, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * List all stashes
   */
  async stashList(): Promise<GitStashEntry[]> {
    if (!this.git || !this._isRepo) return [];

    try {
      const result = await this.git.stashList();
      return result.all.map((entry, index) => ({
        index,
        date: entry.date,
        message: entry.message,
        hash: entry.hash,
      }));
    } catch (error) {
      logger.error('Failed to list stashes', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  }

  /**
   * Get blame information for a file
   */
  async blame(filePath: string): Promise<GitBlameLine[]> {
    if (!this.git || !this._isRepo) return [];

    try {
      if (!(await this.hasCommits())) return [];

      // Using raw git command for blame
      const result = await this.git.raw(['blame', '--line-porcelain', filePath]);
      const lines: GitBlameLine[] = [];
      const chunks = result.split('\n');
      
      let currentBlame: Partial<GitBlameLine> = {};
      let lineNumber = 0;
      
      for (let i = 0; i < chunks.length; i++) {
        const line = chunks[i];
        
        if (line.match(/^[0-9a-f]{40}/)) {
          // New commit hash line
          const parts = line.split(' ');
          currentBlame.hash = parts[0];
          lineNumber = parseInt(parts[2], 10);
        } else if (line.startsWith('author ')) {
          currentBlame.author = line.substring(7);
        } else if (line.startsWith('author-time ')) {
          const timestamp = parseInt(line.substring(12), 10);
          currentBlame.date = new Date(timestamp * 1000).toISOString();
        } else if (line.startsWith('\t')) {
          // Content line (starts with tab)
          currentBlame.content = line.substring(1);
          currentBlame.line = lineNumber;
          
          if (currentBlame.hash && currentBlame.author && currentBlame.date) {
            lines.push(currentBlame as GitBlameLine);
          }
          currentBlame = {};
        }
      }
      
      return lines;
    } catch (error) {
      if (this.isUnbornRepoError(error)) {
        logger.debug('Blame skipped (repo has no commits yet)', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }

      logger.error('Failed to get blame', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get file content from a specific git ref (e.g., HEAD, branch, commit)
   * Returns the file content as a string, or null if not found
   */
  async showFile(filePath: string, ref = 'HEAD'): Promise<{ content: string | null; error?: string }> {
    if (!this.git || !this._isRepo) {
      return { content: null, error: 'Git not initialized or not a repository' };
    }

    try {
      if (!(await this.hasCommits())) {
        return { content: null, error: 'Repository has no commits yet' };
      }

      // Normalize path to use forward slashes for git
      const normalizedPath = filePath.replace(/\\/g, '/');
      
      // Use git show to get file content at specified ref
      const content = await this.git.show([`${ref}:${normalizedPath}`]);
      return { content };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for common "file not in git" errors
      if (errorMessage.includes('exists on disk, but not in') ||
          errorMessage.includes('does not exist in') ||
          errorMessage.includes('fatal: path')) {
        return { content: null, error: 'File not tracked in git at this ref' };
      }
      
      if (this.isUnbornRepoError(error)) {
        return { content: null, error: 'Repository has no commits yet' };
      }

      logger.debug('Failed to show file from git', {
        filePath,
        ref,
        error: errorMessage,
      });
      
      return { content: null, error: errorMessage };
    }
  }

  /**
   * Merge a branch
   */
  async merge(branch: string, options?: { noFf?: boolean; squash?: boolean }): Promise<boolean> {
    if (!this.git || !this._isRepo) return false;

    try {
      if (!(await this.hasCommits())) return false;

      const args: string[] = [branch];
      if (options?.noFf) args.unshift('--no-ff');
      if (options?.squash) args.unshift('--squash');
      
      await this.git.merge(args);
      logger.info('Merge successful', { branch, options });
      return true;
    } catch (error) {
      if (this.isUnbornRepoError(error)) {
        logger.debug('Merge skipped (repo has no commits yet)', {
          branch,
          options,
          error: error instanceof Error ? error.message : String(error),
        });
        return false;
      }

      logger.error('Failed to merge', {
        branch,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Singleton instance
let gitService: GitService | null = null;

/**
 * Get the singleton GitService instance
 */
export function getGitService(): GitService {
  if (!gitService) {
    gitService = new GitService();
  }
  return gitService;
}

export default GitService;
