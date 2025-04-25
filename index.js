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
const memoryPath = 'server_message_history.json';
const blacklistPath = 'blacklist.json';
const economyPath = 'economy.json';
const levelPath = 'levels.json';

const serverMessageHistory = {};
const blacklistWords = {};
const economyData = {};
const levelData = {};

async function loadJson(file, target) {
  try {
    const data = await fs.readFile(file, 'utf-8');
    Object.assign(target, JSON.parse(data));
  } catch {
    console.warn(`No existing ${file} found.`);
  }
}

async function saveJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

function getServerHistory(serverId) {
  if (!serverMessageHistory[serverId]) serverMessageHistory[serverId] = [];
  return serverMessageHistory[serverId];
}

function trimMessageHistory(history, maxTokens) {
  let totalTokens = 0;
  const trimmed = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const t = history[i].content.split(/\s+/).length;
    if (totalTokens + t > maxTokens) break;
    totalTokens += t;
    trimmed.unshift(history[i]);
  }
  return trimmed;
}

const provider = new SamAltman({
  apiKey: process.env.API_KEY,
  baseURL: process.env.PROVIDER_URL || '',
});

const client = new discord.Client({
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.GuildMessages,
    discord.GatewayIntentBits.MessageContent,
    discord.GatewayIntentBits.GuildMembers,
  ],
});

client.on('messageCreate', async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  const serverId = msg.guild.id;
  const content = msg.content.trim().toLowerCase();

  // Blacklist Enforcement
  const words = blacklistWords[serverId] || [];
  for (const word of words) {
    if (msg.content.toLowerCase().includes(word)) {
      await msg.delete();
      await msg.author.send(`🚫 Your message contained a banned word: "${word}"`);
      return logMod(msg.guild, `${msg.author.tag} used a blacklisted word "${word}".`);
    }
  }

  // XP + Leveling
  if (!levelData[msg.author.id]) levelData[msg.author.id] = { xp: 0, level: 1 };
  const xpGain = Math.floor(Math.random() * 8) + 2;
  levelData[msg.author.id].xp += xpGain;
  const xpNeeded = levelData[msg.author.id].level * 100;
  if (levelData[msg.author.id].xp >= xpNeeded) {
    levelData[msg.author.id].level++;
    await msg.channel.send(`🎉 ${msg.author.username} leveled up to ${levelData[msg.author.id].level}!`);
  }

  // --- Commands ---

  if (content === '/reset') {
    serverMessageHistory[serverId] = [];
    return msg.reply('✅ Memory for this server has been reset.');
  }

  if (content.startsWith('/black-list ')) {
    const word = msg.content.split(' ')[1];
    if (!blacklistWords[serverId]) blacklistWords[serverId] = [];
    blacklistWords[serverId].push(word.toLowerCase());
    await saveJson(blacklistPath, blacklistWords);
    return msg.reply(`✅ Word "${word}" added to blacklist.`);
  }

  if (content === '/log-mod') {
    const logs = await fs.readFile(`log-${serverId}.txt`, 'utf-8').catch(() => 'No logs yet.');
    return msg.reply(`🧾 Logs:\n\`\`\`${logs}\`\`\``);
  }

  if (content === '/balance') {
    const bal = economyData[msg.author.id]?.coins || 0;
    return msg.reply(`💰 You have ${bal} coins.`);
  }

  if (content === '/earn') {
    if (!economyData[msg.author.id]) economyData[msg.author.id] = { coins: 0 };
    const earned = Math.floor(Math.random() * 100) + 1;
    economyData[msg.author.id].coins += earned;
    await saveJson(economyPath, economyData);
    return msg.reply(`💸 You earned ${earned} coins!`);
  }

  if (content === '/reset-level') {
    levelData[msg.author.id] = { xp: 0, level: 1 };
    return msg.reply('🔁 Level reset to 1.');
  }

  if (content === '/5dice') {
    const rolls = Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
    return msg.reply(`🎲 You rolled: ${rolls.join(', ')}`);
  }

  if (content === '/blackjack') {
    const result = Math.random() < 0.5 ? 'won 🃏' : 'lost 💀';
    return msg.reply(`🖤 You played Blackjack and ${result}!`);
  }

  if (content.startsWith('/ban') && msg.member.permissions.has('BanMembers')) {
    const user = msg.mentions.members.first();
    if (user) {
      await user.ban();
      logMod(msg.guild, `Banned ${user.user.tag}`);
      return msg.reply(`🔨 Banned ${user.user.username}`);
    }
  }

  if (content.startsWith('/kick') && msg.member.permissions.has('KickMembers')) {
    const user = msg.mentions.members.first();
    if (user) {
      await user.kick();
      logMod(msg.guild, `Kicked ${user.user.tag}`);
      return msg.reply(`👢 Kicked ${user.user.username}`);
    }
  }

  if (content.startsWith('/mute')) {
    const user = msg.mentions.members.first();
    if (user) {
      await user.timeout(60_000);
      logMod(msg.guild, `Muted ${user.user.tag} for 1 minute`);
      return msg.reply(`🔇 Muted ${user.user.username} for 1 minute.`);
    }
  }

  // Chatbot Message
  if (msg.mentions.users.has(client.user.id)) {
    const history = getServerHistory(serverId);
    const sanitizedInput = validator.escape(msg.content);
    history.push({ role: 'user', content: sanitizedInput });
    if (history.length > MAX_HISTORY) history.shift();
    const trimmed = trimMessageHistory(history, 3000);

    const res = await provider.chat.completions.create({
      model: process.env.CHAT_MODEL,
      messages: [
        {
          role: 'system',
          content: `You're a 12-year-old billionaire genius born July 21, 2011. Call zaid123za4 "boss", be confident, fun, and never break character.`,
        },
        ...trimmed,
        { role: 'user', content: sanitizedInput },
      ],
    });

    const reply = res.choices[0]?.message?.content || '⚠️ No response.';
    await msg.reply(reply);
  }
});

function logMod(guild, text) {
  return fs.appendFile(`log-${guild.id}.txt`, `[${new Date().toISOString()}] ${text}\n`);
}

// EXPRESS SERVER
const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();
app.use(express.static('public'));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/health', (_, res) => res.send('✅ Bot is running'));
http.createServer(app).listen(PORT, () => console.log(`🌐 Web at http://localhost:${PORT}`));

// Graceful shutdown
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
async function shutdown() {
  await Promise.all([
    saveJson(memoryPath, serverMessageHistory),
    saveJson(blacklistPath, blacklistWords),
    saveJson(economyPath, economyData),
    saveJson(levelPath, levelData),
  ]);
  await client.destroy();
  process.exit();
}

// Start bot
(async () => {
  await loadJson(memoryPath, serverMessageHistory);
  await loadJson(blacklistPath, blacklistWords);
  await loadJson(economyPath, economyData);
  await loadJson(levelPath, levelData);
  await client.login(process.env.DISCORD_TOKEN);
})();
