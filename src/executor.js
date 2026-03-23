const { spawn } = require('child_process')
const path = require('path')

const MCP_CONFIG = path.resolve(__dirname, '../puppeteer-mcp.json')

// 記錄每個用戶的 session_id，key 格式：`${userId}:${mode}`
const sessionIds = new Map()

// 記錄每個用戶目前進行中的 process
const activeProcs = new Map()

const MODES = {
  default: {
    cwd: undefined,
    addDir: undefined,
    chrome: false,
  },
  dnd: {
    cwd: path.resolve(process.env.HOME, 'code/dnd'),
    addDir: path.resolve(process.env.HOME, 'code/dnd'),
    chrome: false,
  },
  chrome: {
    cwd: undefined,
    addDir: undefined,
    chrome: true,
  },
}

/**
 * 送訊息給 claude --print，利用 --resume 保留對話記憶
 * @param {string} userId
 * @param {string} input
 * @param {string} mode - 'default' | 'dnd' | 'chrome'
 * @returns {Promise<string>}
 */
function sendToSession(userId, input, mode = 'default') {
  return new Promise((resolve, reject) => {
    const sessionKey = `${userId}:${mode}`
    const modeConfig = MODES[mode] || MODES.default

    const args = ['--print', '--output-format', 'json']

    if (sessionIds.has(sessionKey)) {
      args.push('--resume', sessionIds.get(sessionKey))
    }

    if (modeConfig.addDir) {
      args.push('--add-dir', modeConfig.addDir)
    }

    if (modeConfig.chrome) {
      args.push('--chrome')
    }

    args.push(input)

    const proc = spawn('claude', args, {
      env: { ...process.env, NO_COLOR: '1' },
      cwd: modeConfig.cwd,
    })

    // 記錄進行中的 process
    activeProcs.set(userId, proc)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      activeProcs.delete(userId)
      if (code === null || code === 130 || code === 143) {
        // 被 kill 掉
        resolve('🛑 已停止')
        return
      }
      try {
        const json = JSON.parse(stdout.trim())
        if (json.session_id) {
          sessionIds.set(sessionKey, json.session_id)
        }
        resolve(json.result?.trim() || '（無輸出）')
      } catch {
        resolve(stdout.trim() || stderr.trim() || '（無輸出）')
      }
    })

    proc.on('error', (err) => {
      activeProcs.delete(userId)
      reject(err)
    })
  })
}

function stopRequest(userId) {
  if (activeProcs.has(userId)) {
    activeProcs.get(userId).kill('SIGTERM')
    activeProcs.delete(userId)
    return true
  }
  return false
}

function killSession(userId, mode) {
  if (mode) {
    const key = `${userId}:${mode}`
    if (sessionIds.has(key)) {
      sessionIds.delete(key)
      return true
    }
    return false
  }
  let killed = false
  for (const key of sessionIds.keys()) {
    if (key.startsWith(`${userId}:`)) {
      sessionIds.delete(key)
      killed = true
    }
  }
  return killed
}

function hasSession(userId, mode) {
  if (mode) return sessionIds.has(`${userId}:${mode}`)
  return [...sessionIds.keys()].some(k => k.startsWith(`${userId}:`))
}

/**
 * 用 Puppeteer MCP 執行無頭瀏覽器任務（不需要開 Chrome）
 * @param {string} userId
 * @param {string} prompt
 * @returns {Promise<string>}
 */
function sendToPuppeteer(userId, prompt) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p', prompt,
      '--output-format', 'json',
      '--mcp-config', MCP_CONFIG,
      '--dangerously-skip-permissions',
    ]

    const proc = spawn('claude', args, {
      env: { ...process.env, NO_COLOR: '1' },
    })

    activeProcs.set(userId, proc)

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })

    proc.on('close', (code) => {
      activeProcs.delete(userId)
      if (code === null || code === 130 || code === 143) {
        resolve('🛑 已停止')
        return
      }
      try {
        const json = JSON.parse(stdout.trim())
        resolve(json.result?.trim() || '（無輸出）')
      } catch {
        resolve(stdout.trim() || stderr.trim() || '（無輸出）')
      }
    })

    proc.on('error', (err) => {
      activeProcs.delete(userId)
      reject(err)
    })
  })
}

module.exports = { sendToSession, sendToPuppeteer, killSession, hasSession, stopRequest, MODES }
