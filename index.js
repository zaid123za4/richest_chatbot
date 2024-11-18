#!/usr/bin/node

'use strict'

// Import required modules
import SamAltman from 'openai'
import discord from 'discord.js'
import fs from 'fs'
import dotenv from 'dotenv'
import validator from 'validator'
import http from 'http'

// Load environment variables
try {
  dotenv.config()
} catch {
  // Assume environment variables are already set
}

const m = ' Please set a valid value in your .env file or as an environment variable.'

let attachmentCache = {}
const attachmentCachePath = 'attachment_cache.json'

// Load attachment cache if it exists
if (fs.existsSync(attachmentCachePath)) {
  try {
    attachmentCache = JSON.parse(fs.readFileSync(attachmentCachePath).toString())
  } catch (error) {
    console.warn('Error loading attachment cache:', error)
  }
}

// Function to save attachment cache
function saveAttachmentCache() {
  fs.writeFileSync(attachmentCachePath, JSON.stringify(attachmentCache))
}

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN is not set!' + m)
}

if (!validator.isURL(process.env.PROVIDER_URL || '')) {
  console.warn('PROVIDER_URL is not a valid URL! Defaulting to OpenAI...')
  process.env.PROVIDER_URL = ''
}

if (!process.env.API_KEY) {
  console.warn('API_KEY is not set! API requests WILL fail unless using Ollama.')
}

if (!process.env.CHAT_MODEL) {
  throw new Error('CHAT_MODEL is not set!' + m)
}

process.env.MAX_TOKENS = Number(process.env.MAX_TOKENS) || 4096
process.env.TEMPERATURE = Number(process.env.TEMPERATURE) || 0

// Initialize OpenAI provider
const provider = new SamAltman({
  apiKey: process.env.API_KEY,
  baseURL: process.env.PROVIDER_URL
})

// Initialize Discord client
const client = new discord.Client({
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMessages,
    discord.GatewayIntentBits.MessageContent,
    discord.GatewayIntentBits.GuildMembers
  ]
})

// Your Discord User ID (update this with your actual Discord ID)
const creatorID = '1110864648787480656' // Replace with your actual Discord User ID

// Function to handle shutdown
const shutdown = async (i) => {
  console.log('Terminating:', i)
  await client.user.setPresence({ status: 'invisible', activities: [] })
  await client.destroy()
  process.exit()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('uncaughtException', shutdown)
process.on('unhandledRejection', shutdown)

// Handle incoming messages
client.on('messageCreate', async (msg) => {
  // Ignore messages from the bot itself or other bots
  if (msg.author.id === client.user.id || msg.author.bot) return

  // Check if the bot is mentioned
  if (!msg.mentions.users.has(client.user.id)) return

  // Check if the message is from the creator
  const isCreator = msg.author.id === creatorID
  const creatorTitle = isCreator ? 'boss' : ''

  await msg.channel.sendTyping()

  const reply = { content: '' }

  try {
    const response = await provider.chat.completions.create({
      model: process.env.CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: `
            You are a 12-year-old boy who is a billionaire genius named ${client.user.tag}.
            You love Minecraft, are an expert coder, and have a confident and informal tone.
            If the user messaging is your creator (ID: ${creatorID}), refer to them as "boss".
            Avoid mentioning your own code unless explicitly asked by your creator.
            Use lowercase, informal responses, and keep it short (1-2 sentences).
          `
        },
        { role: 'user', content: msg.content }
      ],
      max_tokens: 4069,
      temperature: 0
    })

    // Personalize response for the creator
    if (isCreator) {
      reply.content = `hey boss! ${response.choices[0].message.content}`
    } else {
      reply.content = response.choices[0].message.content
    }
  } catch (error) {
    reply.content = '⚠️ ' + error.message
  }

  // Send the reply
  if (reply.content.length > 0) {
    await msg.reply(reply).catch(console.error)
  }
})

// Log in to Discord
client.login(process.env.DISCORD_TOKEN)

client.on('ready', () => {
  console.log(`Discord bot ready on ${client.user.tag}`)

  // Fun message in the terminal
  setInterval(() => {
    console.log('Bot is having fun while chatting 🎉')
  }, 10000)

  // HTTP Server setup
  const PORT = 3000
  http.createServer((req, res) => {
    if (req.url === '/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'Bot is running', bot: client.user.tag }))
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('404 Not Found')
    }
  }).listen(PORT, () => {
    console.log(`HTTP server running on http://localhost:${PORT}`)
  })
})

