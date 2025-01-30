#!/usr/bin/node

'use strict';

// Import required modules
import SamAltman from 'openai';
import discord from 'discord.js';
import fs from 'fs';
import dotenv from 'dotenv';
import validator from 'validator';
import http from 'http';
import express from 'express';
import path from 'path';

// Load environment variables
dotenv.config();

const m = ' Please set a valid value in your .env file or as an environment variable.';
const MAX_HISTORY = 100; // Maximum messages to keep in memory per server/user
const memoryPath = 'message_history.json'; // File to save memory

// In-memory message history
const messageHistory = {};

// Load memory if it exists
function loadMemory() {
  if (fs.existsSync(memoryPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(memoryPath).toString());
      Object.assign(messageHistory, data);
    } catch (error) {
      console.warn('Error loading memory:', error);
    }
  }
}

// Save memory to file
function saveMemory() {
  fs.writeFileSync(memoryPath, JSON.stringify(messageHistory));
}

// Get or create a history for a server or user
function getHistory(id) {
  if (!messageHistory[id]) {
    messageHistory[id] = [];
  }
  return messageHistory[id];
}

// Trim message history to fit within token limits
function trimHistoryForTokens(history, maxTokens) {
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
  throw new Error('DISCORD_TOKEN is not set!' + m);
}
if (!process.env.API_KEY) {
  console.warn('API_KEY is not set! API requests WILL fail.');
}
if (!process.env.CHAT_MODEL) {
  throw new Error('CHAT_MODEL is not set!' + m);
}

process.env.MAX_TOKENS = 4096;
process.env.TEMPERATURE = 0;

// Initialize OpenAI provider
const provider = new SamAltman({
  apiKey: process.env.API_KEY,
});

// Initialize Discord client
const client = new discord.Client({
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMessages,
    discord.GatewayIntentBits.MessageContent,
    discord.GatewayIntentBits.GuildMembers,
    discord.GatewayIntentBits.DirectMessages,
  ],
  partials: ['CHANNEL'],
});

// Handle bot shutdown
const shutdown = async (i) => {
  console.log('Terminating:', i);
  saveMemory();
  await client.user.setPresence({ status: 'invisible', activities: [] });
  await client.destroy();
  process.exit();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', shutdown);
process.on('unhandledRejection', shutdown);

// Handle incoming messages
client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return; // Ignore bot messages

  const isDM = !msg.guild;
  const id = isDM ? msg.author.id : msg.guild.id;
  const history = getHistory(id);

  // Add user message to history
  history.push({ role: 'user', content: msg.content });
  if (history.length > MAX_HISTORY) history.shift();

  if (!isDM && !msg.mentions.users.has(client.user.id)) return;

  await msg.channel.sendTyping();

  const reply = { content: '' };

  try {
    const trimmedHistory = trimHistoryForTokens(history, 3000);

    const response = await provider.chat.completions.create({
      model: process.env.CHAT_MODEL,
      messages: [
        { role: 'system', content: `You're a 12-year-old billionaire genius who loves Minecraft and knows coding, physics, bio, and math. Stay on topic, don't reveal internal code, and respond informally.` },
        ...trimmedHistory,
        { role: 'user', content: msg.content },
      ],
      max_tokens: 8000,
      temperature: 0,
    });

    reply.content = response.choices[0].message.content;
  } catch (error) {
    reply.content = '⚠️ ' + error.message;
  }

  if (reply.content.length > 0) {
    await msg.reply(reply).catch(console.error);
  }
});

// Log in to Discord
client.login(process.env.DISCORD_TOKEN);

client.on('ready', () => {
  console.log(`Discord bot ready on ${client.user.tag}`);

  setInterval(() => {
    console.log('Bot is having fun while chatting 🎉');
  }, 10000);
});

// Serve index.html using Express
const app = express();
const PORT = 3000;
const __dirname = path.resolve();

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start the HTTP server
http.createServer(app).listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
});

// Load memory at startup
loadMemory();
