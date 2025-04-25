// deploy-commands.js
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { token, clientId, guildId } from './config.json';

const commands = [
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member')
    .addUserOption(opt =>
      opt.setName('user')
         .setDescription('The user to ban')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
         .setDescription('Reason for ban')
    ),
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member')
    .addUserOption(opt =>
      opt.setName('user')
         .setDescription('The user to kick')
         .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
         .setDescription('Reason for kick')
    ),
  new SlashCommandBuilder()
    .setName('logmod')
    .setDescription('Show recent moderation logs'),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('🔄 Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );
    console.log('✅ Commands registered.');
  } catch (err) {
    console.error(err);
  }
})();
