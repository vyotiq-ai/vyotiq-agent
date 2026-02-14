# Vyotiq AI - Troubleshooting Guide

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Runtime Issues](#runtime-issues)
3. [API & Provider Issues](#api--provider-issues)
4. [Terminal Issues](#terminal-issues)
5. [Editor Issues](#editor-issues)
6. [Performance Issues](#performance-issues)
7. [Data & Storage Issues](#data--storage-issues)
8. [Getting Help](#getting-help)

---

## Installation Issues

### "Module not found" or Native Module Errors

**Symptoms:**
- `Cannot find module 'node-pty'`
- `Cannot find module 'better-sqlite3'`
- Build errors during `npm install`

**Solutions:**

1. **Clean reinstall:**
   ```bash
   # Windows (PowerShell)
   Remove-Item -Recurse -Force node_modules, package-lock.json
   npm install

   # macOS/Linux
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Rebuild native modules:**
   ```bash
   npm rebuild
   npx electron-rebuild -f -w node-pty
   ```

3. **Install build tools:**
   - **Windows**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++" workload
   - **macOS**: Run `xcode-select --install`
   - **Linux**: Run `sudo apt-get install build-essential python3`

4. **Check Node.js version:**
   ```bash
   node --version  # Should be 20.x or higher
   npm --version   # Should be 10.x or higher
   ```

### "Python not found" Error

**Symptoms:**
- `gyp ERR! find Python`
- Build fails during native module compilation

**Solutions:**

1. **Install Python:**
   - **Windows**: Download from [python.org](https://www.python.org/downloads/)
   - **macOS**: `brew install python3`
   - **Linux**: `sudo apt-get install python3`

2. **Set Python path:**
   ```bash
   npm config set python /path/to/python3
   npm rebuild
   ```

### "Permission denied" During Installation

**Symptoms:**
- `EACCES: permission denied`
- `npm ERR! code EACCES`

**Solutions:**

1. **Fix npm permissions:**
   ```bash
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'
   export PATH=~/.npm-global/bin:$PATH
   ```

2. **Or use sudo (not recommended):**
   ```bash
   sudo npm install
   ```

---

## Runtime Issues

### App Won't Start

**Symptoms:**
- App crashes immediately
- Blank window appears then closes
- No error message

**Solutions:**

1. **Check logs:**
   ```bash
   # Windows
   type %APPDATA%\Vyotiq\logs\main.log

   # macOS/Linux
   cat ~/.config/Vyotiq/logs/main.log
   ```

2. **Enable debug mode:**
   ```bash
   VYOTIQ_DEBUG=true npm start
   ```

3. **Clear cache:**
   ```bash
   # Windows
   rmdir /s /q %APPDATA%\Vyotiq

   # macOS/Linux
   rm -rf ~/.config/Vyotiq
   ```

4. **Reinstall:**
   ```bash
   npm install
   npm start
   ```

### "Cannot find Electron" Error

**Symptoms:**
- `Cannot find module 'electron'`
- App won't start

**Solutions:**

```bash
npm install electron --save-dev
npm start
```

### App Freezes or Becomes Unresponsive

**Symptoms:**
- UI doesn't respond to clicks
- Agent runs indefinitely
- Terminal appears stuck

**Solutions:**

1. **Kill the process:**
   ```bash
   # Windows
   taskkill /IM Vyotiq.exe /F

   # macOS/Linux
   pkill -f Vyotiq
   ```

2. **Check for infinite loops:**
   - Open DevTools (`Ctrl+Shift+I`)
   - Check console for errors
   - Look for stuck agent runs

3. **Reduce context size:**
   - Settings → Cache → Reduce context window
   - Delete old sessions
   - Clear cache

4. **Restart the app:**
   ```bash
   npm start
   ```

---

## API & Provider Issues

### "No available provider" Error

**Symptoms:**
- Error: "No available provider. Please configure at least one LLM provider"
- Can't send messages

**Solutions:**

1. **Add API key:**
   - Open Settings (`Ctrl + ,`)
   - Go to "AI Providers"
   - Add API key for at least one provider:
     - [Anthropic](https://console.anthropic.com/) (Claude)
     - [OpenAI](https://platform.openai.com/) (GPT-4)
     - [Google AI](https://makersuite.google.com/app/apikey) (Gemini)
     - [DeepSeek](https://platform.deepseek.com/) (DeepSeek)
     - [OpenRouter](https://openrouter.ai/) (200+ models)

2. **Verify API key:**
   - Check for extra spaces or typos
   - Ensure key is valid and not expired
   - Check provider dashboard for usage limits

3. **Test provider:**
   - Try a different provider
   - Check provider status page
   - Verify internet connection

### "Invalid API Key" Error

**Symptoms:**
- `401 Unauthorized`
- `Invalid API key`
- Provider returns authentication error

**Solutions:**

1. **Verify key format:**
   - Remove leading/trailing spaces
   - Check for correct key type (some providers have multiple key types)
   - Ensure you're using the right key for the right provider

2. **Check key permissions:**
   - Log into provider dashboard
   - Verify key has required permissions
   - Check if key is active/enabled

3. **Regenerate key:**
   - Go to provider dashboard
   - Regenerate/create new API key
   - Update in Vyotiq settings

4. **Check rate limits:**
   - Verify you haven't exceeded usage limits
   - Check billing status
   - Ensure account is in good standing

### "Rate Limited" Error

**Symptoms:**
- `429 Too Many Requests`
- `Rate limit exceeded`
- Requests fail intermittently

**Solutions:**

1. **Wait for rate limit to reset:**
   - The system automatically retries after the reset time
   - Check provider dashboard for reset time

2. **Reduce request frequency:**
   - Increase time between messages
   - Use longer context windows to reduce requests
   - Enable prompt caching in settings

3. **Upgrade provider plan:**
   - Check provider pricing
   - Upgrade to higher tier for more requests
   - Consider using OpenRouter for load balancing

4. **Use multiple providers:**
   - Configure multiple providers
   - System will automatically failover
   - Distributes load across providers

### "Connection Timeout" Error

**Symptoms:**
- `ECONNREFUSED`
- `ETIMEDOUT`
- Request hangs then fails

**Solutions:**

1. **Check internet connection:**
   ```bash
   ping google.com
   ```

2. **Check provider status:**
   - Visit provider status page
   - Check for service outages
   - Try accessing provider website directly

3. **Increase timeout:**
   - Settings → Advanced → Increase request timeout
   - Default is 30 seconds

4. **Check firewall/proxy:**
   - Disable VPN temporarily
   - Check firewall rules
   - Verify proxy settings

### "Model Not Found" Error

**Symptoms:**
- `Model 'gpt-5' not found`
- `Invalid model name`

**Solutions:**

1. **Check available models:**
   - Settings → AI Providers
   - See list of available models for each provider
   - Verify model name is correct

2. **Update model list:**
   - Restart the app
   - Check provider documentation for latest models
   - Verify model is available in your region

3. **Use default model:**
   - Settings → AI Providers → Set default model
   - System will use default if specified model unavailable

---

## Terminal Issues

### Terminal Not Working

**Symptoms:**
- Terminal panel shows "No terminal available"
- Commands don't execute
- Terminal crashes

**Solutions:**

1. **Install build tools:**
   - **Windows**: Install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   - **macOS**: Run `xcode-select --install`
   - **Linux**: Run `sudo apt-get install build-essential`

2. **Rebuild node-pty:**
   ```bash
   npm rebuild
   npx electron-rebuild -f -w node-pty
   ```

3. **Check shell availability:**
   ```bash
   # Windows
   where powershell
   where cmd

   # macOS/Linux
   which bash
   which zsh
   ```

4. **Configure shell in settings:**
   - Settings → Terminal → Shell path
   - Set to available shell (bash, zsh, powershell, cmd)

5. **Check permissions:**
   - Ensure shell executable is accessible
   - Check file permissions
   - Try running as administrator (Windows)

### Terminal Output Not Showing

**Symptoms:**
- Terminal runs but no output appears
- Commands execute but results hidden
- Terminal panel is blank

**Solutions:**

1. **Check terminal panel:**
   - Open terminal: `Ctrl + `` (backtick)
   - Verify panel is visible and focused

2. **Enable terminal output:**
   - Settings → Terminal → Enable output streaming
   - Restart terminal

3. **Check command:**
   - Verify command is valid
   - Try simple command: `echo "test"`
   - Check for errors in DevTools console

4. **Increase buffer size:**
   - Settings → Terminal → Buffer size
   - Increase if output is truncated

### Terminal Crashes on Specific Commands

**Symptoms:**
- Terminal crashes when running certain commands
- Specific command causes app to freeze
- Terminal process exits unexpectedly

**Solutions:**

1. **Try alternative command:**
   - Use equivalent command for your shell
   - Example: `dir` (Windows) vs `ls` (Unix)

2. **Check command compatibility:**
   - Verify command works in native terminal
   - Check for shell-specific syntax

3. **Increase timeout:**
   - Settings → Terminal → Command timeout
   - Increase if command takes long time

4. **Report issue:**
   - Note the exact command that crashes
   - Include error message
   - Open GitHub issue with details

---

### File Save Issues

**Symptoms:**
- File won't save
- Save button disabled
- Error when saving

**Solutions:**

1. **Check file permissions:**
   - Verify file is writable
   - Check directory permissions
   - Try saving to different location

2. **Check disk space:**
   - Verify sufficient disk space
   - Free up space if needed
   - Check for disk errors

3. **Check file locks:**
   - Verify file isn't locked by another process
   - Close file in other editors
   - Restart the app

4. **Use "Save As":**
   - Try saving with different name
   - Save to different location
   - Check if original file is corrupted

---

## Performance Issues

### App Runs Slowly

**Symptoms:**
- UI is sluggish
- Typing lag in chat input
- Slow file operations

**Solutions:**

1. **Reduce context size:**
   - Settings → Cache → Reduce context window
   - Delete old sessions
   - Clear cache

2. **Close unused panels:**
   - Close terminal panel if not needed
   - Close browser panel
   - Minimize file tree

3. **Reduce file tree size:**
   - Exclude large directories (.node_modules, .git)
   - Settings → Workspace → Exclude patterns
   - Restart file watcher

4. **Increase memory:**
   - Close other applications
   - Restart the app
   - Check available RAM

5. **Disable debug mode:**
   - Settings → Debug → Disable verbose logging
   - Disable execution tracing
   - Disable full payload capture

### High Memory Usage

**Symptoms:**
- App uses lots of RAM
- System becomes slow
- App crashes due to memory

**Solutions:**

1. **Clear cache:**
   - Settings → Cache → Clear all caches
   - Restart app

2. **Delete old sessions:**
   - Sessions → Delete old sessions
   - Archive long conversations

3. **Reduce context window:**
   - Settings → Cache → Reduce context size
   - Limit conversation history

4. **Close unused features:**
   - Close terminal panel
   - Close browser panel
   - Minimize file tree

5. **Restart app:**
   - Close and reopen Vyotiq
   - Clears memory leaks

### Slow File Operations

**Symptoms:**
- File tree loads slowly
- File search is slow
- File operations timeout

**Solutions:**

1. **Exclude large directories:**
   - Settings → Workspace → Exclude patterns
   - Add `.node_modules`, `.git`, `dist`, `build`
   - Restart file watcher

2. **Reduce file tree depth:**
   - Settings → File Tree → Max depth
   - Limit to 3-4 levels

3. **Use file search instead:**
   - Use `Ctrl+P` for quick file search
   - More efficient than browsing tree

4. **Check disk health:**
   - Run disk check
   - Verify no disk errors
   - Check available space

---

## Data & Storage Issues

### Sessions Not Saving

**Symptoms:**
- Sessions disappear after restart
- Messages lost
- Session state not persisted

**Solutions:**

1. **Check database:**
   - Verify SQLite database exists
   - Check file permissions
   - Verify disk space available

2. **Check settings:**
   - Settings → Storage → Auto-save enabled
   - Verify save interval is reasonable

3. **Restart app:**
   - Close and reopen Vyotiq
   - Force save: `Ctrl+S`

4. **Recover from backup:**
   - Check backup directory
   - Restore from backup if available

### Database Corruption

**Symptoms:**
- "Database is locked" error
- Sessions won't load
- Corrupted data error

**Solutions:**

1. **Restart app:**
   - Close Vyotiq completely
   - Wait 10 seconds
   - Reopen Vyotiq

2. **Clear database:**
   ```bash
   # Windows
   del %APPDATA%\Vyotiq\sessions.db

   # macOS/Linux
   rm ~/.config/Vyotiq/sessions.db
   ```

3. **Restore from backup:**
   - Check backup directory
   - Restore latest backup
   - Restart app

4. **Rebuild database:**
   - Delete corrupted database
   - Restart app (creates new database)
   - Recreate sessions

### Settings Not Persisting

**Symptoms:**
- Settings reset after restart
- API keys disappear
- Preferences not saved

**Solutions:**

1. **Check settings file:**
   ```bash
   # Windows
   type %APPDATA%\Vyotiq\settings.json

   # macOS/Linux
   cat ~/.config/Vyotiq/settings.json
   ```

2. **Check file permissions:**
   - Verify settings file is writable
   - Check directory permissions

3. **Restart app:**
   - Close and reopen Vyotiq
   - Force save settings: `Ctrl+,` then close

4. **Reset settings:**
   - Settings → Advanced → Reset to defaults
   - Reconfigure settings

---

## Getting Help

### Before Reporting an Issue

1. **Check existing issues:**
   - Search [GitHub Issues](https://github.com/vyotiq-ai/Vyotiq-AI/issues)
   - Check if issue already reported

2. **Check documentation:**
   - Read [README.md](../README.md)
   - Check [ARCHITECTURE.md](./ARCHITECTURE.md)
   - Check [DEVELOPMENT.md](./DEVELOPMENT.md)

3. **Try troubleshooting steps:**
   - Follow steps in this guide
   - Try clean reinstall
   - Try different provider

4. **Gather information:**
   - Note exact error message
   - Include steps to reproduce
   - Include system information

### Reporting an Issue

**Create a GitHub issue with:**

1. **Title:** Clear, descriptive title
   - ❌ "App doesn't work"
   - ✅ "Terminal crashes when running npm commands on Windows"

2. **Description:** Detailed description
   - What were you trying to do?
   - What happened?
   - What did you expect?

3. **Steps to reproduce:**
   - Exact steps to reproduce issue
   - Include commands/inputs
   - Include file paths if relevant

4. **System information:**
   - OS and version
   - Node.js version
   - npm version
   - Vyotiq version

5. **Logs:**
   - Include relevant error messages
   - Include console output
   - Include log files if available

6. **Screenshots:**
   - Include screenshots if helpful
   - Show error messages
   - Show UI state

### Getting Support

- 💬 **Discussions**: [GitHub Discussions](https://github.com/vyotiq-ai/Vyotiq-AI/discussions)
- 🐛 **Issues**: [GitHub Issues](https://github.com/vyotiq-ai/Vyotiq-AI/issues)
- 📖 **Documentation**: Check `docs/` directory
- 🔍 **Search**: Search existing issues and discussions

---

## Common Solutions

### "Try turning it off and on again"

```bash
# Close the app completely
# Wait 10 seconds
npm start
```

### Clear Everything and Start Fresh

```bash
# Windows
Remove-Item -Recurse -Force node_modules, package-lock.json, %APPDATA%\Vyotiq
npm install
npm start

# macOS/Linux
rm -rf node_modules package-lock.json ~/.config/Vyotiq
npm install
npm start
```

### Enable Debug Mode

```bash
VYOTIQ_DEBUG=true npm start
# Then check logs in:
# Windows: %APPDATA%\Vyotiq\logs\main.log
# macOS/Linux: ~/.config/Vyotiq/logs/main.log
```

### Check System Requirements

```bash
node --version    # Should be 20.x or higher
npm --version     # Should be 10.x or higher
git --version     # Should be installed
```

---

## Still Having Issues?

If you've tried all troubleshooting steps:

1. **Gather all information:**
   - Error messages
   - System information
   - Steps to reproduce
   - Logs and screenshots

2. **Search for similar issues:**
   - Check GitHub Issues
   - Check GitHub Discussions
   - Check documentation

3. **Create a detailed issue:**
   - Include all information
   - Be specific and clear
   - Include reproducible example

4. **Be patient:**
   - Maintainers will respond when available
   - Provide additional info if requested
   - Help others with similar issues

Thank you for using Vyotiq AI! 🎉
