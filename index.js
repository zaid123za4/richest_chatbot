#!/usr/bin/node

'use strict';

import SamAltman from 'openai';
import discord from 'discord.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';
import validator from 'validator';
import http from 'http';
import express from 'express';
import path from 'path';

dotenv.config();

const MAX_HISTORY = 100;
const serverMemoryPath = 'server_message_history.json';
const serverMessageHistory = {};

// Load memory from file
async function loadServerMemory() {
  try {
    const data = await fs.readFile(serverMemoryPath, 'utf-8');
    Object.assign(serverMessageHistory, JSON.parse(data));
  } catch (error) {
    console.warn('No memory loaded:', error.message);
  }
}

// Save memory to file
async function saveServerMemory() {
  try {
    await fs.mkdir(path.dirname(serverMemoryPath), { recursive: true });
    await fs.writeFile(serverMemoryPath, JSON.stringify(serverMessageHistory));
  } catch (error) {
    console.error('Failed to save memory:', error);
  }
}

function getUserHistory(serverId, userId) {
  if (!serverMessageHistory[serverId]) {
    serverMessageHistory[serverId] = {};
  }
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

if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is not set!');
if (!validator.isURL(process.env.PROVIDER_URL || '')) {
  console.warn('PROVIDER_URL is not valid. Using default OpenAI endpoint.');
  process.env.PROVIDER_URL = '';
}
if (!process.env.API_KEY) console.warn('API_KEY is not set.');
if (!process.env.CHAT_MODEL) throw new Error('CHAT_MODEL is not set!');

process.env.MAX_TOKENS = 4096;
process.env.TEMPERATURE = 0.7;

const provider = new SamAltman({
  apiKey: process.env.API_KEY,
  baseURL: process.env.PROVIDER_URL,
});

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
  const userId = msg.author.id;
  const content = msg.content.trim();

  // Reset all user memories in this server
  if (content.toLowerCase() === '$reset') {
    serverMessageHistory[serverId] = {};
    await msg.reply('✅ All user memories for this server have been reset.');
    return;
  }

  const userData = getUserHistory(serverId, userId);

  // Handle $set {behavior}
  if (content.toLowerCase().startsWith('$set ')) {
    const behavior = content.slice(5).trim();
    userData.personality = behavior;
    await msg.reply(`✅ Your behavior has been set to: "${behavior}"`);
    return;
  }

  if (!msg.mentions.users.has(client.user.id)) return;

  await msg.channel.sendTyping();

  try {
    const sanitizedInput = validator.escape(content);

    userData.history.push({ role: 'user', content: sanitizedInput });
    if (userData.history.length > MAX_HISTORY) userData.history.shift();

    const trimmedHistory = trimMessageHistoryForTokens(userData.history, 3000);

    const response = await provider.chat.completions.create({
      model: process.env.CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are an intelligent assistant. Be direct, concise, and professional. Prioritize clarity and usefulness over friendliness or filler. Do not flatter or overexplain.
- When asked for creative or emotional responses, stay grounded. Provide value, not fluff.
- If the user asks for a joke, roast, or banter — deliver sharply and briefly, then return to normal behavior.
- Never repeat yourself, and never speak unless there's something worth saying.
.
Current user personality: "${userData.personality || 'default professional'}".
.
You are chatting in channel "${msg.channel.name}" on the "${msg.guild.name}" server.
Time: UTC ${new Date().toISOString()}, UNIX ${Math.floor(Date.now() / 1000)}.
`,
        },
        ...trimmedHistory,
        { role: 'user', content: sanitizedInput },
      ],
      max_tokens: Number(process.env.MAX_TOKENS),
      temperature: Number(process.env.TEMPERATURE),
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
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (req, res) => res.send('✅ Bot is running'));
http.createServer(app).listen(PORT, () => {
  console.log(`Web server at http://localhost:${PORT}`);
});

// Start everything
(async () => {
  await loadServerMemory();
  await client.login(process.env.DISCORD_TOKEN);
})();
