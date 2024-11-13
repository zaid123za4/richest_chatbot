
'use strict'

// TO-DO: switch to Python
import SamAltman from 'openai'
import discord from 'discord.js'
import fs from 'fs'
import dotenv from 'dotenv'
import validator from 'validator'

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

if (!validator.isURL(process.env.PROVIDER_URL || '')) { console.warn('PROVIDER_URL is not a valid URL! Defaulting to OpenAI...'); process.env.PROVIDER_URL = '' }
// empty baseURL makes the library default to OpenAI

if (!process.env.API_KEY) { throw new Error('API_KEY is not set!' + m) }

if (!process.env.CHAT_MODEL) { throw new Error('CHAT_MODEL is not set!' + m) }

process.env.MAX_TOKENS = Number(process.env.MAX_TOKENS)
process.env.MAX_TOKENS = Math.floor(process.env.MAX_TOKENS)
if (isNaN(process.env.MAX_TOKENS)) { console.warn('MAX_TOKENS is not a valid integer, defaulting to 4096.'); process.env.MAX_TOKENS = 4096 }

process.env.TEMPERATURE = Number(process.env.TEMPERATURE)
if (isNaN(process.env.TEMPERATURE)) { console.warn('TEMPERATURE is not a valid number, defaulting to 0.'); process.env.TEMPERATURE = 0 }

const provider = new SamAltman({
  apiKey: process.env.API_KEY,
  baseURL: process.env.PROVIDER_URL
})

// no
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

  /*
  if (!models.includes(process.env.STT_MODEL)) {
    console.warn(process.env.STT_MODEL, 'is not a valid STT_MODEL, STT will be disabled.')
    process.env.STT_MODEL = false
  }

  // now this is ambitious
  if (!models.includes(process.env.TTS_MODEL)) {
    console.warn(process.env.TTS_MODEL, 'is not a valid TTS_MODEL, TTS will be disabled.')
    process.env.TTS_MODEL = false
  }
  */
})

const client = new discord.Client({
  intents: [
    1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 1048576, 2097152, 16777216, 33554432
    // TO-DO: only require needed intents
  ]
})

function isBlacklisted (id) {
  if (!fs.existsSync('blacklist.json')) { return false }

  try {
    return JSON.parse(fs.readFileSync('blacklist.json').toString()).includes(id)
    // file deletion can cause a race condition here, so
  } catch (error) {
    console.warn('A blacklist.json exists, but is not valid JSON!', error.message)

    return false
  }
}

function encodeSpecials(content, guild) {
  client.users.cache.forEach((user) => { content = content.replaceAll('<@' + user.id + '>', '<@' + user.tag + '>') }) // replace <@12345678> with <@username>
  client.users.cache.forEach((user) => { content = content.replaceAll('<@!' + user.id + '>', '<@' + user.tag + '>') }) // replace <@!12345678> with <@username>
  client.channels.cache.forEach((channel) => { content = content.replaceAll('<#' + channel.id + '>', '<#' + channel.name + '>') }) // replace <#12345678> with <#channel>
  if (guild) {
    guild.roles.cache.forEach((role) => { content = content.replaceAll('<@&' + role.id + '>', '<@&' + role.name + '>') }) // replace <@&12345678> with <@&role>
  }
}

function decodeSpecials(content, guild) {
  client.users.cache.forEach((user) => { content = content.replaceAll('<@' + user.tag + '>', '<@' + user.id + '>') }) // replace <@username> with <@12345678>
  client.users.cache.forEach((user) => { content = content.replaceAll('<@!' + user.tag + '>', '<@!' + user.id + '>') }) // replace <@!username> with <@!12345678>
  client.channels.cache.forEach((channel) => { content = content.replaceAll('<#' + channel.name + '>', '<#' + channel.id + '>') }) // replace <#channel> with <#12345678>
  if (guild) {
    guild.roles.cache.forEach((role) => { content = content.replaceAll('<@&' + role.name + '>', '<@&' + role.id + '>') }) // replace <@&role> with <@&12345678>
  }
}

client.on('messageCreate', async (msg) => {
  if (msg.author.id === client.user.id || msg.author.bot || !msg.mentions.users.has(client.user.id)) return

  if (isBlacklisted(msg.author.id) || isBlacklisted(msg.channel.id) || isBlacklisted(msg.guild.id)) {
    if (fs.existsSync('Weezer - Buddy Holly.mp3')) {
      await msg.reply({ files: ['./Weezer - Buddy Holly.mp3'] }).catch(x)
    }
    return
  }

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
${process.env.VISION_MODEL ? `- You are provided image descriptions by the ${process.env.VISION_MODEL} model.` : ''}
- Avoid "UwU" or "OwO" as they are deprecated, using ":3" instead.
- Engage in role-playing actions only when requested.
- Available emojis: ${JSON.stringify(msg.guild.emojis.cache.map(emoji => `<:${emoji.name}:${emoji.id}>`))}.
- Avoid using backticks when pinging users or mentioning channels.
- Avoid using LaTeX math as it is not rendered by Discord.`
    }
  ]

  channelMessages = channelMessages.reverse()

  for (let message of channelMessages) {
    message = message[1]

    if (message.author.id === client.user.id) {
      messages.push({ role: 'assistant', content: encodeSpecials(message.content) })
    } else {
      let content = ''

      if (message.type === 7) {
        messages.push({ role: 'user', content: `<@${message.author.id}> joined the server.` })
        continue
      }

      content += new Date().toISOString() + '\n'
      content += `<@${message.author.tag}>`
      if (message.author.nickname) content += ` (${message.author.nickname})`
      if (message.author.bot) content += ' (BOT)'
      if (message.editedTimestamp) content += ' (edited)'
      if (message.type === 19) content += ` (replying to <@${message.reference.messageId || 'unknown'}>)`
      content += `:\n${message.content}`

      content = encodeSpecials(content, message.guild);

      if (message.attachments.size > 0) {
        content += '\n\n'

        for (let attachment of message.attachments) {
          attachment = attachment[1]

          if (attachment.contentType.startsWith('image/') && process.env.VISION_MODEL) {
            if (attachmentCache[attachment.url]) {
              attachment.description = attachmentCache[attachment.url]
            } else {
              try {
                let response = await provider.chat.completions.create({
                  model: process.env.VISION_MODEL,
                  messages: [{
                    role: 'user',
                    content: [
                      {
                        type: 'text',
                        text: 'Describe this image in 250 words. Transcribe text if any is present.'
                      },
                      {
                        type: 'image_url',
                        image_url: {
                          url: attachment.url
                        }
                      }
                    ]
                  }],
                  max_tokens: 1024,
                  temperature: 0
                })

                response = response.choices[0].message.content
                attachment.description = response
                attachmentCache[attachment.url] = response
              } catch (error) {
                attachment.description = error.message
              }
            }
          }
        }

        content += message.attachments.size + ' attachment(s): ' + JSON.stringify(Array.from(message.attachments.values()))
      }

      // 1970-01-01T00:00:00.000Z
      // <@abc> (BOT) (edited) (replying to <@xyz>):
      // you are a fool. a gigantic FOOL.
      //
      // 123 attachment(s): [ ... ]

      // TO-DO: reactions
      messages.push({ role: 'user', content })
    }
  }

  const reply = { content: '', files: [], embeds: [] }

  try {
    const response = await provider.chat.completions.create({
      model: process.env.CHAT_MODEL,
      messages,
      max_tokens: process.env.MAX_TOKENS,
      temperature: process.env.TEMPERATURE
    })

    reply.content = response.choices[0].message.content
  } catch (error) {
    reply.content = '⚠️ ' + error.message
    reply.files.push(new discord.AttachmentBuilder(Buffer.from(JSON.stringify(error.response?.data || error.stack, null, 4)), { name: 'error.json' }))
  }

  clearInterval(typer)

  if (reply.content === '') { return }

  reply.content = decodeSpecials(reply.content, msg.guild);

  if (reply.content.length > 2000) {
    reply.files.push(new discord.AttachmentBuilder(Buffer.from(reply.content), { name: 'message.txt' }))
    reply.content = reply.content.slice(0, 2000)
  }

  await msg.reply(reply).catch(async () => { await msg.channel.send(reply).catch(x) })
})

client.login(process.env.DISCORD_TOKEN)

client.on('ready', async () => {
  console.log('ready on', client.user.tag)

  // client.application.edit("who out here large languaging my models 😞");

  // client.user.setActivity("free ballpoint hammer giveaway at 123 fazbear st", { "type": discord.ActivityType.Custom });
})
