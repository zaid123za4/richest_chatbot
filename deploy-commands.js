import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { token, clientId, guildId } from './config.json';

const commands = [
  // Moderation
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  new SlashCommandBuilder()
    .setName('logmod')
    .setDescription('Show moderation logs'),
  new SlashCommandBuilder()
    .setName('blacklist-add')
    .setDescription('Add a word to blacklist')
    .addStringOption(o => o.setName('word').setDescription('Word').setRequired(true)),
  new SlashCommandBuilder()
    .setName('blacklist-view')
    .setDescription('View blacklisted words'),
  new SlashCommandBuilder()
    .setName('blacklist-remove')
    .setDescription('Remove a word from blacklist')
    .addStringOption(o => o.setName('word').setDescription('Word').setRequired(true)),

  // Economy
  new SlashCommandBuilder().setName('balance').setDescription('Check your balance'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim daily reward'),
  new SlashCommandBuilder().setName('work').setDescription('Work for coins'),
  new SlashCommandBuilder().setName('beg').setDescription('Beg for coins'),
  new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('Deposit to bank')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('Withdraw from bank')
    .addIntegerOption(o => o.setName('amount').setDescription('Amount').setRequired(true)),
  new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Rob a user')
    .addUserOption(o => o.setName('user').setDescription('Target').setRequired(true)),
  new SlashCommandBuilder().setName('shop').setDescription('View shop items'),
  new SlashCommandBuilder()
    .setName('buy')
    .setDescription('Buy an item')
    .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),
  new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell an item')
    .addStringOption(o => o.setName('item').setDescription('Item name').setRequired(true)),
  new SlashCommandBuilder().setName('inventory').setDescription('View your inventory'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Richest users'),

  // Leveling
  new SlashCommandBuilder().setName('level').setDescription('Check your level'),
  new SlashCommandBuilder()
    .setName('level-reset')
    .setDescription('Reset someone’s level')
    .addUserOption(o => o.setName('user').setDescription('Target')),
  new SlashCommandBuilder().setName('xp-leaderboard').setDescription('Top levels'),

  // Earn
  new SlashCommandBuilder().setName('earn').setDescription('Do a task for coins'),

  // Fun
  new SlashCommandBuilder().setName('5dice').setDescription('Roll 5 dice'),
  new SlashCommandBuilder().setName('blackjack').setDescription('Play Blackjack'),

  // Utilities
  new SlashCommandBuilder().setName('reset').setDescription('Reset chat memory'),
  new SlashCommandBuilder().setName('cooldown-reset').setDescription('Reset all cooldowns')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);
await rest.put(
  Routes.applicationGuildCommands(clientId, guildId),
  { body: commands }
);
console.log('✅ Registered all slash commands');
