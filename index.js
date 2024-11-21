#!/usr/bin/node

'use strict'

import OpenAI from 'openai'
import discord from 'discord.js'
import fs from 'node:fs'
import dotenv from 'dotenv'
import validator from 'validator'
import express from 'express'

const app = express();

app.use(express.static('public'))

app.listen(10000, () => {
	console.log("listening on port 10000");
});


try {
  dotenv.config()
} catch {
  // assume environment variables are set in the environment
}

const x = () => {} // to be used where error handling is not needed

const m = ' Please set a valid value in your .env file or as an environment variable.'

// eslint-disable-next-line prefer-const
let attachmentCache = {}

if (!process.env.DISCORD_TOKEN) { throw new Error('DISCORD_TOKEN is not set!' + m) }

if (!validator.isURL(process.env.PROVIDER_URL || '')) { throw new Error('PROVIDER_URL is not a valid URL!' + m) }

if (!process.env.API_KEY) { throw new Error('API_KEY is not set!' + m) }

if (!process.env.CHAT_MODEL) { throw new Error('CHAT_MODEL is not set!' + m) }

process.env.MAX_TOKENS = Number(process.env.MAX_TOKENS)
process.env.MAX_TOKENS = Math.floor(process.env.MAX_TOKENS)
if (isNaN(process.env.MAX_TOKENS)) { console.warn('MAX_TOKENS is not a valid integer, defaulting to 1024.'); process.env.MAX_TOKENS = 1024 }

process.env.TEMPERATURE = Number(process.env.TEMPERATURE)
if (isNaN(process.env.TEMPERATURE)) { console.warn('TEMPERATURE is not a valid number, defaulting to 0.'); process.env.TEMPERATURE = 0 }

const provider = new OpenAI({
  apiKey: process.env.API_KEY,
  baseURL: process.env.PROVIDER_URL
})

await provider.models.list().then((models) => {
  models = models.data.map(model => model.id)

  if (!models.includes(process.env.CHAT_MODEL)) {
    console.error(process.env.CHAT_MODEL, 'is not a valid CHAT_MODEL!', m)
    process.exit(1)
  }

  if (!models.includes(process.env.VISION_MODEL)) {
    console.warn(process.env.VISION_MODEL, 'is not a valid VISION_MODEL, vision will be disabled.')
    process.env.VISION_MODEL = false
  }
})

const client = new discord.Client({
  intents: [
    1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 1048576, 2097152, 16777216, 33554432
    // TO-DO: only require needed intents
  ]
})

// function to use to gracefully shutdown the bot
const shutdown = async (i) => {
  console.log('Terminating:', i)

  await client.user.setPresence({
    status: 'invisible',
    activities: []
  })

  await client.destroy()
  process.exit()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('uncaughtException', shutdown)
process.on('unhandledRejection', shutdown)

let blacklist = []

if (fs.existsSync('blacklist.json')) {
  try {
    blacklist = JSON.parse(fs.readFileSync('blacklist.json'))
  } catch (error) {
    console.warn('Error while parsing blacklist.json:', error.mesage)
  }
}

fs.watch('blacklist.json', (eventType, filename) => {
  // TO-DO: figure out why this fires twice
  try {
    blacklist = JSON.parse(fs.readFileSync('blacklist.json'))
    console.info('Blacklist updated from blacklist.json')
  } catch (error) {
    console.warn('Error while parsing blacklist.json:', error.mesage)
  }
})

function isBlacklisted (id) {
  return blacklist.includes(id)
}

function makeSpecialsLlmFriendly (content, guild) {
  client.users.cache.forEach((user) => { content = content.replaceAll('<@' + user.id + '>', '<@' + user.tag + '>') }) // replace <@12345678> with <@username>
  client.users.cache.forEach((user) => { content = content.replaceAll('<@!' + user.id + '>', '<@' + user.tag + '>') }) // replace <@!12345678> with <@username>
  client.channels.cache.forEach((channel) => { content = content.replaceAll('<#' + channel.id + '>', '<#' + channel.name + '>') }) // replace <#12345678> with <#channel>
  if (guild) {
    guild.roles.cache.forEach((role) => { content = content.replaceAll('<@&' + role.id + '>', '<@&' + role.name + '>') }) // replace <@&12345678> with <@&role>
  }

  return content
}

function makeSpecialsLlmUnfriendly (content, guild) {
  client.users.cache.forEach((user) => { content = content.replaceAll('<@' + user.tag + '>', '<@' + user.id + '>') }) // replace <@username> with <@12345678>
  client.users.cache.forEach((user) => { content = content.replaceAll('<@!' + user.tag + '>', '<@!' + user.id + '>') }) // replace <@!username> with <@!12345678>
  client.channels.cache.forEach((channel) => { content = content.replaceAll('<#' + channel.name + '>', '<#' + channel.id + '>') }) // replace <#channel> with <#12345678>
  if (guild) {
    guild.roles.cache.forEach((role) => { content = content.replaceAll('<@&' + role.name + '>', '<@&' + role.id + '>') }) // replace <@&role> with <@&12345678>
  }

  return content
}

client.on('messageCreate', async (msg) => {
  if (msg.author.id === client.user.id) return

  if (isBlacklisted(msg.author.id) || isBlacklisted(msg.channel.id) || isBlacklisted(msg.guild.id)) { return }

  if (!msg.mentions.users.has(client.user.id) || msg.author.bot) return

  try {
    await msg.channel.sendTyping()
  } catch {
    return // an error here means we can't send messages, so don't even bother.
  }

  const typer = setInterval(() => { msg.channel.sendTyping() }, 5000)
  // may need to be reduced to accomodate worse internet connections

  // fetch 100 messages
  try {
    // eslint-disable-next-line no-var
    var channelMessages = await msg.channel.messages.fetch({ limit: 100 })
  } catch {
    clearInterval(typer)
    return
  }

  const messages = [
    {
      role: 'system',
      content:
`- You are an AI assistant, based on the "${process.env.CHAT_MODEL}" model, named ${client.user.tag}.
- You are in the "${msg.channel.name}" channel (<#${msg.channel.id}>) of the "${msg.guild.name}" Discord server.
- UTC time: ${new Date().toISOString()} (UNIX: ${Math.floor(Date.now() / 1000)}).
- Use informal language with all-lowercase and only 1-2 sentences.
${(process.env.VISION_MODEL && process.env.VISION_MODEL !== process.env.CHAT_MODEL) ? `- You are provided image descriptions by the ${process.env.VISION_MODEL} model.` : ''}
- Engage in role-playing actions only when requested.
- Available emojis: ${JSON.stringify(msg.guild.emojis.cache.map(emoji => `<:${emoji.name}:${emoji.id}>`))}.
- Avoid using "UwU" or "OwO" as they are deprecated, instead using ":3".`
    }
  ]

  channelMessages = channelMessages.reverse()

  for (let message of channelMessages) {
    message = message[1]

    if (message.author.id === client.user.id) {
      messages.push({ role: 'assistant', content: makeSpecialsLlmFriendly(message.content) })
    } else {
      let content = [{ type: 'text', text: '' }]

      if (message.type === 7) {
        messages.push({ role: 'user', content: `<@${message.author.id}> joined the server.` })
        continue
      }

      content[0].text += new Date().toISOString() + '\n'
      content[0].text += `<@${message.author.tag}>`
      if (message.author.nickname) { content[0].text += ` (${message.author.nickname})` }
      if (message.author.bot) { content[0].text += ' (BOT)' }
      if (message.editedTimestamp) { content[0].text += ' (edited)' }
      if (message.type === 19) { content[0].text += ` (replying to <@${message.reference.messageId || 'unknown'}>)` }

      content[0].text += ':\n' + makeSpecialsLlmFriendly(message.content, message.guild)

      if (message.reactions.cache.size > 0) {
        content[0].text += '\n\n'

        const reactions = {}

        for (const [emojiId, reaction] of message.reactions.cache.entries()) {
          // Fetch users who reacted with this emoji
          const users = await reaction.users.fetch()

          // Convert the users collection to an array of user IDs or usernames
          const userList = users.map(user => user.username)

          // Store the users in the reactionsData object
          reactions[reaction.emoji.toString()] = userList
        }

        content[0].text += 'Reactions: ' + JSON.stringify(reactions)
      }

      if (message.attachments.size > 0) {
        content[0].text += '\n\n'

        for (let attachment of message.attachments) {
          attachment = attachment[1]

          // TO-DO: refactor to make future STT support less messy
          if (attachment.contentType.startsWith('image/') && process.env.VISION_MODEL) {
            if (process.env.CHAT_MODEL === process.env.VISION_MODEL) {
              content.push({ type: 'image_url', image_url: { url: attachment.url } })
            } else {
              try {
                let response = await provider.chat.completions.create({
                  model: process.env.VISION_MODEL,
                  messages: [{ role: 'user', content: [{ type: 'text', text: 'Describe this image in 250 words. Transcribe text if any is present.' }, { type: 'image_url', image_url: { url: attachment.url } }] }],
                  max_tokens: 1024,
                  temperature: 0
                })

                response = response.choices[0].message.content
                attachment.description = response
                attachmentCache[attachment.url] = attachment.description
              } catch (error) {
                if (!attachment.description) { attachment.description = error.message }
              }
            }
          }
        }

        content[0].text += message.attachments.size + ' attachment(s): ' + JSON.stringify(Array.from(message.attachments.values()))
      }

      if (content.length === 1) {
        content = content[0].text
      }

      // 1970-01-01T00:00:00.000Z
      // <@abc> (BOT) (edited) (replying to <@xyz>):
      // example message content here
      //
      // 123 attachment(s): [ ... ]

      messages.push({ role: 'user', content })
    }
  }

  const reply = { content: '', files: [], embeds: [] }

  try {
    const response = await provider.chat.completions.create({
      model: process.env.CHAT_MODEL,
      messages,
      max_tokens: Number(process.env.MAX_TOKENS),
      temperature: Number(process.env.TEMPERATURE)
    })

    reply.content = response.choices[0].message.content
  } catch (error) {
    reply.content = '⚠️ ' + error.message
    reply.files.push(new discord.AttachmentBuilder(Buffer.from(JSON.stringify(error.response?.data || error.stack, null, 4)), { name: 'error.json' }))
  }

  clearInterval(typer)

  if (reply.content === '') { return }

  reply.content = makeSpecialsLlmUnfriendly(reply.content, msg.guild)

  if (reply.content.length > 2000) {
    reply.files.push(new discord.AttachmentBuilder(Buffer.from(reply.content), { name: 'message.txt' }))
    reply.content = reply.content.slice(0, 2000)
  }

  await msg.reply(reply).catch(async () => { await msg.channel.send(reply).catch(x) })
})

client.login(process.env.DISCORD_TOKEN)

client.on('ready', async () => {
  console.log('ready on', client.user.tag)

  // client.application.edit("custom bot about me here");

  // client.user.setActivity("custom bot status here", { "type": discord.ActivityType.Custom });
})
