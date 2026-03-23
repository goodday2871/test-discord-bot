require('dotenv').config()

const { Client, GatewayIntentBits } = require('discord.js')
const { handleMessage } = require('./handler')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
})

client.once('clientReady', () => {
  console.log(`✅ Bot 已上線：${client.user.tag}`)
  console.log(`🔒 允許用戶 ID：${process.env.ALLOWED_USER_ID}`)
})

client.on('messageCreate', handleMessage)

client.on('error', (err) => {
  console.error('Discord client 錯誤：', err)
})

client.login(process.env.DISCORD_TOKEN)
