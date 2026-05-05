const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Bot is running');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

const tgToken = "8592295552:AAHImGm7CZXQ1K-3vc9zuRFSukBfs8KMnhw";
const bot = new TelegramBot(tgToken, { polling: true });

let sock = null;
let isConnected = false;

async function startBot() {
    try {
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const { version } = await fetchLatestBaileysVersion();

        sock = makeWASocket({
            version,
            auth: state,
            logger: undefined,
            browser: ["Chrome", "Windows", "10"],
            printQRInTerminal: true,
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", (update) => {
            const { connection, qr } = update;
            
            if (qr) {
                console.log("SCAN THIS QR CODE:");
                QRCode.generate(qr, { small: true });
            }
            
            if (connection === "open") {
                isConnected = true;
                console.log("WHATSAPP CONNECTED!");
                bot.sendMessage(6074977440, "Bot is online!").catch(e => console.log(e));
            }
            
            if (connection === "close") {
                isConnected = false;
                console.log("DISCONNECTED, RECONNECTING...");
                setTimeout(startBot, 5000);
            }
        });
    } catch (err) {
        console.log("Start error:", err);
        setTimeout(startBot, 10000);
    }
}

startBot();

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text === "/start") {
        return bot.sendMessage(chatId, "Send numbers like: 1639-399-4079");
    }

    const numbers = text.split(/\s+/);
    const final = [];

    for (let n of numbers) {
        let c = n.replace(/\D/g, "");
        if (c.length === 10) final.push("1" + c);
        else if (c.length === 11 && c.startsWith("1")) final.push(c);
    }

    if (!final.length) return bot.sendMessage(chatId, "No valid numbers");

    if (!isConnected) return bot.sendMessage(chatId, "WhatsApp connecting...");

    for (let num of final) {
        try {
            const [res] = await sock.onWhatsApp(num + "@s.whatsapp.net");
            if (res && res.exists) {
                await bot.sendMessage(chatId, num + " ❌ Banned");
            } else {
                await bot.sendMessage(chatId, num + " ✅ Fresh");
            }
        } catch (e) {
            await bot.sendMessage(chatId, num + " ⚠️ Error");
        }
    }
});

console.log("Bot Started!");