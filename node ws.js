const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot is running');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

const tgToken = "8592295552:AAHImGm7CZXQ1K-3vc9zuRFSukBfs8KMnhw";
const bot = new TelegramBot(tgToken, { polling: true });

let sock = null;
let isConnected = false;

async function startBot() {
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
            console.log("SCAN THIS QR:");
            QRCode.generate(qr, { small: true });
        }

        if (connection === "open") {
            isConnected = true;
            console.log("CONNECTED!");
            bot.sendMessage(6074977440, "Bot online").catch(() => {});
        }

        if (connection === "close") {
            isConnected = false;
            setTimeout(startBot, 5000);
        }
    });
}

startBot();

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text === "/start") {
        return bot.sendMessage(chatId, "Send numbers like: 1639-399-4079");
    }

    const raw = text.split(/\s+/);
    const numbers = [];

    for (let item of raw) {
        let clean = item.replace(/\D/g, "");
        if (clean.length === 10) numbers.push("1" + clean);
        else if (clean.length === 11 && clean.startsWith("1")) numbers.push(clean);
    }

    if (!numbers.length) return bot.sendMessage(chatId, "No valid numbers");
    if (!isConnected) return bot.sendMessage(chatId, "WhatsApp connecting...");

    for (let num of numbers) {
        try {
            const [res] = await sock.onWhatsApp(num + "@s.whatsapp.net");
            const status = res?.exists ? "❌ Banned" : "✅ Fresh";
            await bot.sendMessage(chatId, num + " " + status);
        } catch {
            await bot.sendMessage(chatId, num + " ⚠️ Error");
        }
    }
});

console.log("Bot Started - NO PINO!");
