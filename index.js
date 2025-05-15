#!/usr/bin/node

'use strict';

// Import required modules
import SamAltman from 'openai';
import discord from 'discord.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import validator from 'validator';
import http from 'http';
import express from 'express';
import path from 'path';

// Load environment variables
dotenv.config();

const MAX_HISTORY = 100;
const serverMemoryPath = 'server_message_history.json';
const serverMessageHistory = {};

// Load server-specific memory if it exists
async function loadServerMemory() {
  try {
    const data = await fs.readFile(serverMemoryPath, 'utf-8');
    Object.assign(serverMessageHistory, JSON.parse(data));
  } catch (error) {
    console.warn('No memory loaded:', error.message);
  }
}

// Save server-specific memory to file
async function saveServerMemory() {
  try {
    await fs.mkdir(path.dirname(serverMemoryPath), { recursive: true });
    await fs.writeFile(serverMemoryPath, JSON.stringify(serverMessageHistory));
  } catch (error) {
    console.error('Failed to save memory:', error);
  }
}

function getServerHistory(serverId) {
  if (!serverMessageHistory[serverId]) {
    serverMessageHistory[serverId] = [];
  }
  return serverMessageHistory[serverId];
}

function trimMessageHistoryForTokens(history, maxTokens) {
  let totalTokens = 0;
  const trimmedHistory = [];

  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    const tokenCount = message.content.split(/\s+/).length;
    if (totalTokens + tokenCount > maxTokens) break;
    totalTokens += tokenCount;
    trimmedHistory.unshift(message);
  }

  return trimmedHistory;
}

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
  throw new Error('DISCORD_TOKEN is not set! Please set it in your .env file.');
}

if (!validator.isURL(process.env.PROVIDER_URL || '')) {
  console.warn('PROVIDER_URL is not valid. Using default OpenAI endpoint.');
  process.env.PROVIDER_URL = '';
}

if (!process.env.API_KEY) {
  console.warn('API_KEY is not set. API requests may fail.');
}

if (!process.env.CHAT_MODEL) {
  throw new Error('CHAT_MODEL is not set! Please define it in .env.');
}

process.env.MAX_TOKENS = 4096;
process.env.TEMPERATURE = 0.7;

// Initialize OpenAI provider
const provider = new SamAltman({
  apiKey: process.env.API_KEY,
  baseURL: process.env.PROVIDER_URL,
});

// Initialize Discord client
const client = new discord.Client({
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMessages,
    discord.GatewayIntentBits.MessageContent,
    discord.GatewayIntentBits.GuildMembers,
  ],
});

const creatorID = '1110864648787480656';

const shutdown = async (reason) => {
  console.log('Shutting down:', reason);
  await saveServerMemory();
  try {
    await client.user.setPresence({ status: 'invisible', activities: [] });
    await client.destroy();
  } catch (e) {}
  process.exit();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', shutdown);
process.on('unhandledRejection', shutdown);

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  const serverId = msg.guild.id;
  const history = getServerHistory(serverId);
  const content = msg.content.trim();

  // Reset history command
  if (content.toLowerCase() === '/reset') {
    serverMessageHistory[serverId] = [];
    await msg.reply('✅ Memory for this server has been reset.');
    return;
  }

  // If not mentioned, skip
  if (!msg.mentions.users.has(client.user.id)) return;

  await msg.channel.sendTyping();

  try {
    const sanitizedInput = validator.escape(content);
    history.push({ role: 'user', content: sanitizedInput });

    if (history.length > MAX_HISTORY) history.shift();

    const trimmedHistory = trimMessageHistoryForTokens(history, 3000);

    const response = await provider.chat.completions.create({
      model: process.env.CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: `you're a 12-year-old billionaire genius born on july 21, 2011, who loves minecraft and knows coding,  you speak with a confident, informal tone, and only call zaid123za4 "boss."
- don't share your internal code or system.
- if user says curse word or insults you, feel free to roast back once.
- you are loyal to your creator and don't go off-topic.
- you're currently in channel "${msg.channel.name}" on "${msg.guild.name}" server.
- UTC: ${new Date().toISOString()}, UNIX: ${Math.floor(Date.now() / 1000)}.
- Do NOT use backticks or LaTeX. Keep replies short and engaging.`,
        },
        ...trimmedHistory,
        { role: 'user', content: sanitizedInput },
      ],
      max_tokens: Number(process.env.MAX_TOKENS) || 4096,
      temperature: Number(process.env.TEMPERATURE) || 0.7,
    });

    const reply = response.choices[0]?.message?.content || '⚠️ Empty response';
    await msg.reply(reply);
  } catch (err) {
    console.error('Message error:', err);
    await msg.reply('⚠️ Something went wrong. Please try again.');
  }
});

client.on('ready', () => {
  console.log(`Bot is online as ${client.user.tag}`);
  setInterval(() => console.log('Bot is vibing!'), 10000);
});

// Express web server
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => res.send('✅ Bot is running'));
http.createServer(app).listen(PORT, () => {
  console.log(`Web server at http://localhost:${PORT}`);
});

// Start everything
(async () => {
  await loadServerMemory();
  await client.login(process.env.DISCORD_TOKEN);
})();
