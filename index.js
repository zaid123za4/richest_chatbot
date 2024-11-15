// Import required modules
import { Client, GatewayIntentBits, ActivityType } from 'discord.js';
import fs from 'fs';
import dotenv from 'dotenv';
import validator from 'validator';
import express from 'express';
import path from 'path';
import SamAltman from 'openai';

// Load environment variables
dotenv.config();

// TO-DO: switch to Python
const x = () => {}; // to be used where error handling is not needed

const m = ' Please set a valid value in your .env file or as an environment variable.';

// Function to encode special characters
function encodeSpecials(str) {
  if (typeof str !== 'string') return str;

  // Escape special characters to avoid issues with special symbols or formatting
  return str.replace(/([_*`~])/g, '\\$1'); // This escapes `_`, `*`, `` ` ``, and `~`
}

// Function to decode special characters (reverse of encodeSpecials)
function decodeSpecials(str) {
  if (typeof str !== 'string') return str;

  // Unescape special characters
  return str.replace(/\\([_*`~])/g, '$1'); // Reverse of escape operation
}

// Function to update the bot's status
async function updateStatus() {
  try {
    // Update the bot's activity
    await client.user.setPresence({
      activities: [
        {
          name: 'Chatting with users!',
          type: ActivityType.Watching, // 'PLAYING', 'LISTENING', 'WATCHING', etc.
        }
      ],
      status: 'online', // 'online', 'idle', 'dnd', etc.
    });

    console.log('\x1b[36m[ STATUS ]\x1b[0m', 'Bot status updated successfully!');
  } catch (error) {
    console.error('[ERROR]', 'Failed to update bot status:', error);
  }
}

// Bot-related configuration
if (!process.env.DISCORD_TOKEN) { throw new Error('DISCORD_TOKEN is not set!' + m); }

if (!validator.isURL(process.env.PROVIDER_URL || '')) {
  console.warn('PROVIDER_URL is not a valid URL! Defaulting to OpenAI...');
  process.env.PROVIDER_URL = ''; // empty baseURL makes the library default to OpenAI
}

if (!process.env.API_KEY) { throw new Error('API_KEY is not set!' + m); }

if (!process.env.CHAT_MODEL) { throw new Error('CHAT_MODEL is not set!' + m); }

process.env.MAX_TOKENS = Number(process.env.MAX_TOKENS);
process.env.MAX_TOKENS = Math.floor(process.env.MAX_TOKENS);
if (isNaN(process.env.MAX_TOKENS)) { 
  console.warn('MAX_TOKENS is not a valid integer, defaulting to 4096.'); 
  process.env.MAX_TOKENS = 4096; 
}

process.env.TEMPERATURE = Number(process.env.TEMPERATURE);
if (isNaN(process.env.TEMPERATURE)) { 
  console.warn('TEMPERATURE is not a valid number, defaulting to 0.'); 
  process.env.TEMPERATURE = 0; 
}

const provider = new SamAltman({
  apiKey: process.env.API_KEY,
  baseURL: process.env.PROVIDER_URL,
});

await provider.models.list().then((models) => {
  models = models.data.map(model => model.id);

  if (!models.includes(process.env.CHAT_MODEL)) {
    console.error(process.env.CHAT_MODEL, 'is not a valid CHAT_MODEL!', m);
    process.exit(1);
  }

  if (!models.includes(process.env.VISION_MODEL)) {
    console.warn(process.env.VISION_MODEL, 'is not a valid VISION_MODEL, vision will be disabled.');
    process.env.VISION_MODEL = false;
  }
});

// Set up express server
const app = express();
const port = 4000;
app.get('/', (req, res) => {
  const __dirname = path.dirname(new URL(import.meta.url).pathname);
const imagePath = path.join(__dirname, 'index.html');
  res.sendFile(imagePath);
});
app.listen(port, () => {
  console.log('\x1b[36m[ SERVER ]\x1b[0m', '\x1b[32m SH : http://localhost:' + port + ' ✅\x1b[0m');
});

const statusMessages = ["🎧 WATCHING ~~[RICHEST~SERVER]~~", "🎮 Playing MINECRAFT"];
const statusTypes = [ 'online', 'online'];
let currentStatusIndex = 0;
let currentTypeIndex = 0;

// Bot setup and intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent
  ]
});

// Blacklist check
function isBlacklisted(id) {
  if (!fs.existsSync('blacklist.json')) return false;

  try {
    return JSON.parse(fs.readFileSync('blacklist.json').toString()).includes(id);
  } catch (error) {
    console.warn('A blacklist.json exists, but is not valid JSON!', error.message);
    return false;
  }
}

let attachmentCache = {};

client.on('messageCreate', async (msg) => {
  // Ignore messages from the bot itself and other bots
  if (msg.author.id === client.user.id || msg.author.bot || !msg.mentions.users.has(client.user.id)) return;

  // Blacklist check
  if (isBlacklisted(msg.author.id) || isBlacklisted(msg.channel.id) || isBlacklisted(msg.guild.id)) {
    if (fs.existsSync('Weezer - Buddy Holly.mp3')) {
      await msg.reply({ files: ['./Weezer - Buddy Holly.mp3'] }).catch(() => {});
    }
    return;
  }

  // Respond immediately with the bot typing indicator
  try {
    await msg.channel.sendTyping();
  } catch {
    return; // If an error occurs, it can't send messages, so return
  }

  const userMessage = msg.content.trim();

  // Reset the conversation context for every new message
  const messages = [
    {
      role: 'system',
      content: `You are a 12-year-old AI who is a billionaire genius, knows coding very well, and has a confident and informal tone. Respond in 1-2 sentences, using lowercase.`,
    },
    {
      role: 'user',
      content: encodeSpecials(userMessage),
    },
  ];

  // Make the request to the chat model
  const reply = await provider.chat.completions.create({
    model: process.env.CHAT_MODEL,
    messages: messages,
    temperature: process.env.TEMPERATURE || 0,
    max_tokens: 200,
  }).catch((e) => {
    console.error('[ERROR]', e);
    return { error: e };
  });

  if (reply.error) {
    console.error('[ERROR]', reply.error);
    return;
  }

  // Decode and send the response
  const response = decodeSpecials(reply.choices[0].message.content);
  await msg.reply(response).catch(() => {});
});


client.on('ready', async () => {
  console.log('\x1b[36m[ LOGIN ]\x1b[0m', '\x1b[32mLogged in successfully as ' + client.user.tag + ' \x1b[0m');
  updateStatus(); // Now calling the updateStatus function to update the bot's status
});

// Bot login
async function login() {
  try {
    await client.login(process.env.DISCORD_TOKEN);
    console.log('\x1b[36m[ LOGIN ]\x1b[0m', `Logged in as: ${client.user.tag} ✅`);
    console.log('\x1b[36m[ INFO ]\x1b[0m', `Bot ID: ${client.user.id}`);
    console.log('\x1b[36m[ INFO ]\x1b[0m', `Connected to ${client.guilds.cache.size} server(s)`);
  } catch (error) {
    console.error('\x1b[31m[ ERROR ]\x1b[0m', 'Failed to log in:', error);
    process.exit(1);
  }
}

login();
