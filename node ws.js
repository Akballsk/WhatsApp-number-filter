const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");

// Express server
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
        <h1>🤖 WhatsApp Number Checker Bot</h1>
        <p>Status: 🟢 Running</p>
    `);
});

app.listen(port, () => {
    console.log(`✅ Web server running on port ${port}`);
});

// Telegram Bot Token
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
            logger: undefined,  // pino সরানো
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            printQRInTerminal: true,
        });

        sock.ev.on("creds.update", saveCreds);

        sock.ev.on("connection.update", (update) => {
            const { connection, qr } = update;
            
            if (qr) {
                console.log("📱 Scan this QR code:");
                QRCode.generate(qr, { small: true });
            }
            
            if (connection === "open") {
                isConnected = true;
                console.log("✅ WhatsApp Connected!");
                bot.sendMessage(6074977440, "✅ Bot is online on Render!").catch(e => console.log("Bot message error"));
            }
            
            if (connection === "close") {
                isConnected = false;
                console.log("❌ Disconnected, reconnecting in 5 seconds...");
                setTimeout(startBot, 5000);
            }
        });
    } catch (error) {
        console.log("Error starting bot:", error);
        setTimeout(startBot, 10000);
    }
}

startBot().catch(err => console.log(err));

// Telegram message handler
bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text === "/start") {
        return bot.sendMessage(chatId, `🤖 WhatsApp Number Checker Bot

Send US/Canada numbers:
Example: 1639-399-4079

Status: ${isConnected ? '✅ Active' : '⏳ Connecting...'}`);
    }

    const rawNumbers = text.split(/\s+/);
    const finalNumbers = [];

    for (let item of rawNumbers) {
        let clean = item.replace(/\D/g, "");
        if (clean.length === 10) finalNumbers.push("1" + clean);
        else if (clean.length === 11 && clean.startsWith("1")) finalNumbers.push(clean);
    }

    if (finalNumbers.length === 0) {
        return bot.sendMessage(chatId, "❌ No valid numbers found!");
    }

    if (!isConnected) {
        return bot.sendMessage(chatId, "⏳ WhatsApp connecting... Please wait 1-2 minutes.");
    }

    const processingMsg = await bot.sendMessage(chatId, `🔍 Found ${finalNumbers.length} numbers\n⏳ Processing...`);

    let index = 1;
    let banned = 0;
    let fresh = 0;

    for (let formattedNum of finalNumbers) {
        try {
            const jid = `${formattedNum}@s.whatsapp.net`;
            const [result] = await sock.onWhatsApp(jid);

            if (result && result.exists) {
                await bot.sendMessage(chatId, `${index}. ❌ ${formattedNum} - Banned`);
                banned++;
            } else {
                await bot.sendMessage(chatId, `${index}. ✅ ${formattedNum} - Fresh Num`);
                fresh++;
            }
        } catch (e) {
            await bot.sendMessage(chatId, `${index}. ⚠️ ${formattedNum} - Error`);
            fresh++;
        }
        index++;
        await new Promise(res => setTimeout(res, 500));
    }
    
    await bot.editMessageText(`✅ Check Complete!\n\n❌ Banned: ${banned}\n✅ Fresh: ${fresh}\n📱 Total: ${finalNumbers.length}`, {
        chat_id: chatId,
        message_id: processingMsg.message_id
    });
});

console.log("🤖 Bot started successfully!");