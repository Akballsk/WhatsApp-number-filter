const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('<h1>🤖 WhatsApp Bot Running</h1>');
});

app.listen(port, () => {
    console.log(`✅ Web server running on port ${port}`);
});

const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8592295552:AAHImGm7CZXQ1K-3vc9zuRFSukBfs8KMnhw";
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
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            printQRInTerminal: true,
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", (update) => {
            const { connection, qr } = update;
            
            if (qr) {
                console.log("📱 Scan QR:");
                QRCode.generate(qr, { small: true });
            }
            
            if (connection === "open") {
                isConnected = true;
                console.log("✅ WhatsApp Connected!");
            }
            
            if (connection === "close") {
                isConnected = false;
                setTimeout(startBot, 5000);
            }
        });
    } catch (error) {
        console.log("Error:", error);
        setTimeout(startBot, 10000);
    }
}

startBot();

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text === "/start") {
        return bot.sendMessage(chatId, `WhatsApp Bot\nStatus: ${isConnected ? '✅ Active' : '⏳ Connecting...'}\nSend numbers: 1639-399-4079`);
    }

    const numbers = text.split(/\s+/);
    const finalNumbers = [];

    for (let item of numbers) {
        let clean = item.replace(/\D/g, "");
        if (clean.length === 10) finalNumbers.push("1" + clean);
        else if (clean.length === 11 && clean.startsWith("1")) finalNumbers.push(clean);
    }

    if (finalNumbers.length === 0) return bot.sendMessage(chatId, "No valid numbers!");

    if (!isConnected) return bot.sendMessage(chatId, "WhatsApp connecting...");

    for (let num of finalNumbers) {
        try {
            const [result] = await sock.onWhatsApp(`${num}@s.whatsapp.net`);
            const status = result?.exists ? "❌ Banned" : "✅ Fresh";
            await bot.sendMessage(chatId, `${num} ${status}`);
        } catch (e) {
            await bot.sendMessage(chatId, `${num} ⚠️ Error`);
        }
    }
});

console.log("Bot started!");