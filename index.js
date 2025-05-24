#!/usr/bin/env node
'use strict';

// Imports
import SamAltman from 'openai';
import discord from 'discord.js';
import fs from 'fs/promises';
import fssync from 'fs';
import dotenv from 'dotenv';
import validator from 'validator';
import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverMemoryPath = './server_message_history.json';
const behaviorDBPath = './database.json';

// ENV validation
if (!process.env.DISCORD_TOKEN) throw new Error('❌ DISCORD_TOKEN is not set!');
if (!process.env.API_KEY) console.warn('⚠️ API_KEY is not set.');
if (!process.env.CHAT_MODEL) throw new Error('❌ CHAT_MODEL is not set!');
if (!validator.isURL(process.env.PROVIDER_URL || '')) {
  console.warn('⚠️ PROVIDER_URL is not valid. Using default OpenAI endpoint.');
  process.env.PROVIDER_URL = '';
}
process.env.MAX_TOKENS = 4096;
process.env.TEMPERATURE = 0.7;

// Constants
const MAX_HISTORY = 100;
const creatorID = '1110864648787480656';

// Memory
const serverMessageHistory = {};
let behaviorDB = {};

// Load Memory
async function loadServerMemory() {
  try {
    const data = await fs.readFile(serverMemoryPath, 'utf-8');
    Object.assign(serverMessageHistory, JSON.parse(data));
  } catch (err) {
    console.warn('No server memory loaded:', err.message);
  }

  try {
    if (fssync.existsSync(behaviorDBPath)) {
      behaviorDB = JSON.parse(fssync.readFileSync(behaviorDBPath));
    } else {
      fssync.writeFileSync(behaviorDBPath, JSON.stringify({}, null, 2));
    }
  } catch (err) {
    console.warn('No behavior database loaded:', err.message);
  }
}

// Save Memory
async function saveServerMemory() {
  try {
    await fs.mkdir(path.dirname(serverMemoryPath), { recursive: true });
    await fs.writeFile(serverMemoryPath, JSON.stringify(serverMessageHistory));
    fssync.writeFileSync(behaviorDBPath, JSON.stringify(behaviorDB, null, 2));
  } catch (err) {
    console.error('Memory save error:', err);
  }
}

// Helpers
function getUserHistory(serverId, userId) {
  if (!serverMessageHistory[serverId]) serverMessageHistory[serverId] = {};
  if (!serverMessageHistory[serverId][userId]) {
    serverMessageHistory[serverId][userId] = {
      history: [],
      personality: '',
    };
  }
  return serverMessageHistory[serverId][userId];
}

function trimMessageHistoryForTokens(history, maxTokens) {
  let totalTokens = 0;
  const trimmed = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    const tokenCount = msg.content.split(/\s+/).length;
    if (totalTokens + tokenCount > maxTokens) break;
    totalTokens += tokenCount;
    trimmed.unshift(msg);
  }
  return trimmed;
}

// OpenAI Provider
const provider = new SamAltman({
  apiKey: process.env.API_KEY,
  baseURL: process.env.PROVIDER_URL,
});

// Discord Client
const client = new discord.Client({
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMessages,
    discord.GatewayIntentBits.MessageContent,
    discord.GatewayIntentBits.GuildMembers,
  ],
});

// Bot Ready
client.on('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  setInterval(() => console.log('✅ Bot heartbeat'), 10000);
});

// Message Handler
client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  const serverId = msg.guild.id;
  const userId = msg.author.id;
  const content = msg.content.trim();
  const args = content.split(/ +/);
  const command = args.shift().toLowerCase();

  // $reset
  if (command === '$reset') {
    serverMessageHistory[serverId] = {};
    await msg.reply('🧠 All user memories for this server have been reset.');
    return;
  }

  // $set [behavior]
  if (command === '$set') {
    const behavior = args.join(' ');
    if (!behavior) return msg.reply('❌ Please provide a behavior. Usage: `$set [behavior]`');
    behaviorDB[userId] = { behavior };
    await fs.writeFile(behaviorDBPath, JSON.stringify(behaviorDB, null, 2));
    return msg.reply(`✅ Your behavior has been set to: "${behavior}"`);
  }

  // $get
  if (command === '$get') {
    const b = behaviorDB[userId]?.behavior || 'none';
    return msg.reply(`🧠 Your current behavior is: "${b}"`);
  }

  // $mybehavior
  if (command === '$mybehavior') {
    const b = behaviorDB[userId]?.behavior || 'none';
    return msg.reply(`🧠 Your current behavior is: "${b}"`);
  }

  // $data
  if (command === '$data') {
    if (userId !== creatorID) return msg.reply('❌ You are not authorized to use this command.');
    return msg.channel.send({ files: [behaviorDBPath] });
  }

  // Mention-triggered AI response
  if (!msg.mentions.users.has(client.user.id)) return;

  await msg.channel.sendTyping();
  try {
    const sanitizedInput = validator.escape(content);
    const userData = getUserHistory(serverId, userId);
    userData.history.push({ role: 'user', content: sanitizedInput });
    if (userData.history.length > MAX_HISTORY) userData.history.shift();

    const trimmedHistory = trimMessageHistoryForTokens(userData.history, 3000);
    const personality = behaviorDB[userId]?.behavior || 'default professional';

    const response = await provider.chat.completions.create({
      model: process.env.CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: `u are an ai . be profinashional and respond in long only when need 
-Current user personality: "${personality}" respond according to user personlity.
-Channel: "${msg.channel.name}", Server: "${msg.guild.name}".
-Time: UTC ${new Date().toISOString()}, UNIX ${Math.floor(Date.now() / 1000)}.`,
        },
        ...trimmedHistory,
        { role: 'user', content: sanitizedInput },
      ],
      max_tokens: Number(process.env.MAX_TOKENS),
      temperature: Number(process.env.TEMPERATURE),
    });

    const reply = response.choices[0]?.message?.content || '⚠️ Empty response.';
    await msg.reply(reply);
  } catch (err) {
    console.error('❌ AI error:', err);
    await msg.reply('⚠️ Something went wrong.');
  }
});

// Express Web Server
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.static('public'));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (_, res) => res.send('✅ Bot is healthy'));
http.createServer(app).listen(PORT, () =>
  console.log(`🌐 Web server running at http://localhost:${PORT}`)
);

// Graceful Shutdown
const shutdown = async (reason) => {
  console.log('🔻 Shutting down:', reason);
  await saveServerMemory();
  try {
    await client.user.setPresence({ status: 'invisible', activities: [] });
    await client.destroy();
  } catch {}
  process.exit();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', shutdown);
process.on('unhandledRejection', shutdown);

// Start
await loadServerMemory();
await client.login(process.env.DISCORD_TOKEN);
