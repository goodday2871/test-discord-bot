const { sendToSession, sendToPuppeteer, killSession, hasSession, stopRequest } = require('./executor')

const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID
const DISCORD_MAX_LENGTH = 1990

// 記錄每個用戶目前的模式
const userModes = new Map()

function getMode(userId) {
  return userModes.get(userId) || 'default'
}

// 超過 Discord 字元限制時分段送出
async function sendLong(channel, text) {
  const lines = text.split('\n')
  let chunk = ''

  for (const line of lines) {
    if ((chunk + '\n' + line).length > DISCORD_MAX_LENGTH) {
      await channel.send('```\n' + chunk + '\n```')
      chunk = line
    } else {
      chunk = chunk ? chunk + '\n' + line : line
    }
  }

  if (chunk) {
    await channel.send('```\n' + chunk + '\n```')
  }
}

// 差勤系統登入 + 執行後續動作（Chrome 擴充套件模式）
async function ehrsAction(userId, actionPrompt) {
  const username = process.env.EHRS_USERNAME
  const password = process.env.EHRS_PASSWORD

  const prompt =
    `請執行以下步驟：\n` +
    `1. 開啟新分頁並前往 https://ehrs.pchome.tw/SCSRwd/\n` +
    `2. 等待頁面載入完成\n` +
    `3. 檢查頁面是否有登入表單（帳號/密碼輸入欄位）\n` +
    `4. 如果有登入表單：填入帳號「${username}」和密碼「${password}」，然後點擊登入按鈕，等待登入完成\n` +
    `5. 登入後或已登入的情況下，執行以下動作：\n` +
    `${actionPrompt}`

  userModes.set(userId, 'chrome')
  return sendToSession(userId, prompt, 'chrome')
}

async function handleMessage(message) {
  // 忽略 Bot 自己的訊息
  if (message.author.bot) return

  // 白名單檢查
  if (message.author.id !== ALLOWED_USER_ID) {
    await message.reply('⛔ 你沒有使用權限')
    return
  }

  const content = message.content.trim()
  if (!content) return

  const userId = message.author.id
  const currentMode = getMode(userId)

  // 內建指令
  if (content === '!stop') {
    const stopped = stopRequest(userId)
    await message.reply(stopped ? '🛑 已強制停止進行中的請求' : '⚠️ 目前沒有進行中的請求')
    return
  }

  if (content === '!reset') {
    const killed = killSession(userId)
    await message.reply(killed ? '✅ Session 已重置' : '⚠️ 目前沒有進行中的 Session')
    return
  }

  if (content === '!status') {
    const active = hasSession(userId)
    const modeLabel = currentMode === 'dnd' ? '🎲 DnD 模式' : currentMode === 'chrome' ? '🌐 Chrome 模式' : '💬 一般模式'
    await message.reply(`${modeLabel} | Session：${active ? '🟢 進行中' : '⚪ 未建立'}`)
    return
  }

  if (content === '!dnd') {
    userModes.set(userId, 'dnd')
    await message.reply('🎲 已切換到 **DnD 模式** — 對話將在 `~/code/dnd` 目錄下執行\n輸入 `開啟選單` 開始冒險！')
    return
  }

  if (content === '!default') {
    userModes.set(userId, 'default')
    await message.reply('💬 已切換到**一般模式**')
    return
  }

  if (content === '!chrome') {
    userModes.set(userId, 'chrome')
    await message.reply('🌐 已切換到 **Chrome 模式** — 可透過 claude 操控瀏覽器\n例如：`開啟 google.com`、`截圖目前頁面`、`點擊搜尋按鈕`')
    return
  }

  if (content === '!差勤系統') {
    const username = process.env.EHRS_USERNAME
    const password = process.env.EHRS_PASSWORD
    if (!username || !password || username === '你的帳號') {
      await message.reply('⚠️ 請先在 `.env` 填入 `EHRS_USERNAME` 和 `EHRS_PASSWORD`')
      return
    }
    const thinking = await message.reply('🌐 開啟差勤系統中...')
    try {
      const output = await ehrsAction(userId, '回報目前頁面狀態與可用功能')
      await thinking.delete()
      await sendLong(message.channel, '✅ 差勤系統\n' + output)
    } catch (err) {
      await thinking.edit(`❌ 錯誤：${err.message}`)
    }
    return
  }

  if (content === '!上班') {
    const username = process.env.EHRS_USERNAME
    const password = process.env.EHRS_PASSWORD
    if (!username || !password || username === '你的帳號') {
      await message.reply('⚠️ 請先在 `.env` 填入 `EHRS_USERNAME` 和 `EHRS_PASSWORD`')
      return
    }
    const thinking = await message.reply('🕘 上班打卡中...')
    try {
      const output = await ehrsAction(userId,
        `   - 點擊 id 為 "BtnWork" 的上班打卡按鈕\n` +
        `   - 等待確認訊息出現\n` +
        `   - 回報打卡結果（成功/失敗）及打卡時間`
      )
      await thinking.delete()
      await sendLong(message.channel, '🕘 上班打卡\n' + output)
    } catch (err) {
      await thinking.edit(`❌ 錯誤：${err.message}`)
    }
    return
  }

  if (content === '!下班') {
    const username = process.env.EHRS_USERNAME
    const password = process.env.EHRS_PASSWORD
    if (!username || !password || username === '你的帳號') {
      await message.reply('⚠️ 請先在 `.env` 填入 `EHRS_USERNAME` 和 `EHRS_PASSWORD`')
      return
    }
    const thinking = await message.reply('🕕 下班打卡中...')
    try {
      const output = await ehrsAction(userId,
        `   - 點擊 id 為 "BtnOffWork" 的下班打卡按鈕\n` +
        `   - 等待確認訊息出現\n` +
        `   - 回報打卡結果（成功/失敗）及打卡時間`
      )
      await thinking.delete()
      await sendLong(message.channel, '🕕 下班打卡\n' + output)
    } catch (err) {
      await thinking.edit(`❌ 錯誤：${err.message}`)
    }
    return
  }

  if (content === '!help') {
    await message.reply(
      '**可用指令：**\n' +
      '`!stop` — 強制停止目前進行中的請求\n' +
      '`!上班` — 自動登入差勤系統並上班打卡\n' +
      '`!下班` — 自動登入差勤系統並下班打卡\n' +
      '`!差勤系統` — 開啟差勤系統並登入\n' +
      '`!dnd` — 切換到 DnD 冒險模式（~/code/dnd）\n' +
      '`!chrome` — 切換到 Chrome 控制模式\n' +
      '`!default` — 切換到一般對話模式\n' +
      '`!reset` — 重置目前模式的 session\n' +
      '`!status` — 查看目前模式與 session 狀態\n' +
      '`!help` — 顯示此說明\n\n' +
      '其他任何訊息都會直接送給 claude CLI'
    )
    return
  }

  // 顯示「正在處理」
  const modeLabel = currentMode === 'dnd' ? '🎲' : currentMode === 'chrome' ? '🌐' : '⏳'
  const thinking = await message.reply(`${modeLabel} 處理中...`)

  try {
    const output = await sendToSession(userId, content, currentMode)
    await thinking.delete()
    await sendLong(message.channel, output)
  } catch (err) {
    await thinking.edit(`❌ 錯誤：${err.message}`)
  }
}

module.exports = { handleMessage }
