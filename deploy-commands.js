// deploy-commands.js
import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { token, clientId } from './config.json';

const commands = [
  new SlashCommandBuilder()
    .setName('logmod')
    .setDescription('Show recent moderation logs'),
  // … add other commands here …
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log('Refreshing application (/) commands...');
    // Register globally (or use applicationGuildCommands for per-guild)
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error(err);
  }
})();
