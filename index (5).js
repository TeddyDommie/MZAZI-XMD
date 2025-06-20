/* MZAZI Bot - Fixed Version */
const {
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  default: mzaziConnect,
  DisconnectReason,
  jidDecode,
  proto,
  getContentType,
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const axios = require("axios");
const express = require("express");
const chalk = require("chalk");
const FileType = require("file-type");
const figlet = require("figlet");

const app = express();

const event = require("./action/events");
const authenticationn = require("./action/auth");
const PhoneNumber = require("awesome-phonenumber");
const {
  imageToWebp,
  videoToWebp,
  writeExifImg,
  writeExifVid,
} = require("./lib/mzaziexif");

const {
  smsg,
  isUrl,
  generateMessageTag,
  getBuffer,
  getSizeMedia,
  fetchJson,
  sleep,
} = require("./lib/mzazifunc");

const {
  sessionName,
  session,
  autobio,
  autolike,
  port,
  packname,
  autoviewstatus,
} = require("./set.js");

const color = (text, color) =>
  !color ? chalk.green(text) : chalk.keyword(color)(text);

console.log(
  color(
    figlet.textSync("MZAZI", {
      font: "Standard",
      horizontalLayout: "default",
      verticalLayout: "default",
      whitespaceBreak: false,
    }),
    "green"
  )
);

async function startMzazi() {
  await authenticationn();
  const { state, saveCreds } = await useMultiFileAuthState("session");
  const { version, isLatest } = await fetchLatestBaileysVersion();

  console.log(`Using WA v${version.join(".")}, isLatest: ${isLatest}`);

  const client = mzaziConnect({
    logger: pino({ level: "silent" }),
    printQRInTerminal: true,
    browser: ["MZAZI-XMD", "Safari", "5.1.7"],
    auth: state,
    syncFullHistory: true,
  });
  client.public = true;
  
  if (autobio === true) {
    setInterval(() => {
      const date = new Date();
      client.updateProfileStatus(
        `${date.toLocaleString("en-US", {
          timeZone: "Africa/Nairobi",
        })} It's a ${date.toLocaleString("en-US", {
          weekday: "long",
          timeZone: "Africa/Nairobi",
        })}.`
      );
    }, 10 * 1000);
  }

  client.ev.on("messages.upsert", async (chatUpdate) => {
    try {
      let mek = chatUpdate.messages[0];
      if (!mek.message) return;
      mek.message =
        Object.keys(mek.message)[0] === "ephemeralMessage"
          ? mek.message.ephemeralMessage.message
          : mek.message;

      if (
        autoviewstatus === "TRUE" &&
        mek.key.remoteJid === "status@broadcast"
      ) {
        client.readMessages([mek.key]);
      }

      if (
        autolike === "TRUE" &&
        mek.key.remoteJid === "status@broadcast"
      ) {
        const mzazii = await client.decodeJid(client.user.id);
        await client.sendMessage(
          mek.key.remoteJid,
          { react: { key: mek.key, text: "🎭" } },
          { statusJidList: [mek.key.participant, mzazii] }
        );
      }

      if (!client.public && !mek.key.fromMe && chatUpdate.type === "notify")
        return;

      let m = smsg(client, mek);
      const mzazi = require("./mzazi");
      mzazi(client, m, chatUpdate);
    } catch (err) {
      console.log(err);
    }
  });

  client.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      let decode = jidDecode(jid) || {};
      return (
        (decode.user && decode.server && decode.user + "@" + decode.server) ||
        jid
      );
    } else return jid;
  };

  client.ev.on("contacts.update", (update) => {
    for (let contact of update) {
      let id = client.decodeJid(contact.id);
      console.log(`Contact updated: ${id} - ${contact.notify}`);
    }
  });

  client.ev.on("group-participants.update", (m) => event(client, m));

  client.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      let reason = new Boom(lastDisconnect?.error)?.output.statusCode;
      if (
        [
          DisconnectReason.badSession,
          DisconnectReason.connectionClosed,
          DisconnectReason.connectionLost,
          DisconnectReason.connectionReplaced,
          DisconnectReason.loggedOut,
          DisconnectReason.restartRequired,
          DisconnectReason.timedOut,
        ].includes(reason)
      ) {
        console.log("Reconnecting...");
        startMzazi();
      } else {
        console.log(`Unknown DisconnectReason: ${reason} | ${connection}`);
      }
    } else if (connection === "open") {
      try {
        await client.groupAcceptInvite("ErhgRpemSxKDWJunjNr3yw");
      } catch (e) {
        console.log("Group invite failed or already joined.");
      }
      console.log(color("MZAZI-XMD connected!", "green"));
    }
  });

  client.ev.on("creds.update", saveCreds);

  // ========== Extended Client Methods ==========

  client.sendImage = async (jid, path, caption = "", quoted = "", options) => {
    let buffer = Buffer.isBuffer(path)
      ? path
      : /^data:.*?\/.*?;base64,/i.test(path)
      ? Buffer.from(path.split`,`[1], "base64")
      : /^https?:\/\//.test(path)
      ? await getBuffer(path)
      : fs.existsSync(path)
      ? fs.readFileSync(path)
      : Buffer.alloc(0);
    return await client.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted });
  };

  client.sendFile = async (jid, PATH, fileName, quoted = {}, options = {}) => {
    let types = await client.getFile(PATH, true);
    let { filename, size, ext, mime, data } = types;
    let type = '', mimetype = mime, pathFile = filename;
    if (options.asDocument) type = 'document';
    if (options.asSticker || /webp/.test(mime)) {
      let { writeExif } = require('./lib/mzaziexif.js');
      let media = { mimetype: mime, data };
      pathFile = await writeExif(media, { packname: packname, author: packname, categories: options.categories ? options.categories : [] });
      await fs.promises.unlink(filename);
      type = 'sticker';
      mimetype = 'image/webp';
    } else if (/image/.test(mime)) type = 'image';
    else if (/video/.test(mime)) type = 'video';
    else if (/audio/.test(mime)) type = 'audio';
    else type = 'document';
    await client.sendMessage(jid, { [type]: { url: pathFile }, mimetype, fileName, ...options }, { quoted, ...options });
    return fs.promises.unlink(pathFile);
  };

  client.parseMention = async (text) => {
    return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net');
  };

  client.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await getBuffer(path) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0);
    let buffer;
    if (options && (options.packname || options.author)) {
      buffer = await writeExifImg(buff, options);
    } else {
      buffer = await imageToWebp(buff);
    }
    await client.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
    return buffer;
  };

  client.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
    let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await getBuffer(path) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0);
    let buffer;
    if (options && (options.packname || options.author)) {
      buffer = await writeExifVid(buff, options);
    } else {
      buffer = await videoToWebp(buff);
    }
    await client.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted });
    return buffer;
  };

  client.downloadMediaMessage = async (message) => {
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const stream = await downloadContentFromMessage(message, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
  };

  client.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
    let quoted = message.msg ? message.msg : message;
    let mime = (message.msg || message).mimetype || '';
    let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0];
    const stream = await downloadContentFromMessage(quoted, messageType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    let type = await FileType.fromBuffer(buffer);
    let trueFileName = attachExtension ? (filename + '.' + type.ext) : filename;
    await fs.writeFileSync(trueFileName, buffer);
    return trueFileName;
  };

  client.sendText = (jid, text, quoted = "", options) =>
    client.sendMessage(jid, { text: text, ...options }, { quoted });

  client.cMod = (jid, copy, text = "", sender = client.user.id, options = {}) => {
    let mtype = Object.keys(copy.message)[0];
    let isEphemeral = mtype === "ephemeralMessage";
    if (isEphemeral) {
      mtype = Object.keys(copy.message.ephemeralMessage.message)[0];
    }
    let msg = isEphemeral ? copy.message.ephemeralMessage.message : copy.message;
    let content = msg[mtype];
    if (typeof content === "string") msg[mtype] = text || content;
    else if (content.caption) content.caption = text || content.caption;
    else if (content.text) content.text = text || content.text;
    if (typeof content !== "string") msg[mtype] = { ...content, ...options };
    if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
    if (copy.key.remoteJid.includes("@s.whatsapp.net")) sender = sender || copy.key.remoteJid;
    else if (copy.key.remoteJid.includes("@broadcast")) sender = sender || copy.key.remoteJid;
    copy.key.remoteJid = jid;
    copy.key.fromMe = sender === client.user.id;
    return proto.WebMessageInfo.fromObject(copy);
  };

  return client;
}

app.use(express.static("pixel"));
app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));
app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`));

startMzazi();

let file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(chalk.redBright(`Update ${__filename}`));
  delete require.cache[file];
  require(file);
});
