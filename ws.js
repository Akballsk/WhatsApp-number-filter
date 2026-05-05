const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");
const pino = require("pino");
const express = require("express");

// Express server for Render
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Bot is Running</h1>
        <p>Status: Active</p>
        <p>Check Render logs for QR code</p>
    `);
});

app.listen(port, () => {
    console.log(`✅ Web server running on port ${port}`);
});

// Telegram Bot Token (Render Environment Variable)
const tgToken = process.env.TELEGRAM_BOT_TOKEN || "8202590545:AAF_3F1LzWMc9HRPLwGDvzmHn173gP4ysdE";
const bot = new TelegramBot(tgToken, { polling: true });

let sock = null;
let isConnected = false;

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: true,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, qr, lastDisconnect } = update;
        
        if (qr) {
            console.log("📱 WhatsApp QR Code:");
            QRCode.generate(qr, { small: true });
            console.log("QR Code generated at:", new Date().toISOString());
        }
        
        if (connection === "open") {
            isConnected = true;
            console.log("✅ WhatsApp Connected!");
            bot.sendMessage(6074977440, "✅ Bot is online on Render!");
        }
        
        if (connection === "close") {
            isConnected = false;
            console.log("❌ Disconnected, reconnecting...");
            setTimeout(startBot, 5000);
        }
    });
}

startBot().catch(err => console.log(err));

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text || text === "/start") {
        return bot.sendMessage(chatId, `🤖 WhatsApp Number Checker Bot

Send US/Canada numbers:
• 1639-399-4079
• 16393994079

Bot Status: ${isConnected ? '✅ Active' : '⏳ Connecting...'}`);
    }

    // Extract numbers
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
        return bot.sendMessage(chatId, "⏳ WhatsApp connecting... Please wait 1-2 minutes");
    }

    const processingMsg = await bot.sendMessage(chatId, `<b>Found ${finalNumbers.length} numbers</b>\n<i>Processing... 🔵</i>`, { parse_mode: "HTML" });

    let index = 1;
    let banned = 0;
    let fresh = 0;

    for (let formattedNum of finalNumbers) {
        try {
            const jid = `${formattedNum}@s.whatsapp.net`;
            const [result] = await sock.onWhatsApp(jid);

            let statusLine = "";
            
            if (result && result.exists) {
                statusLine = `${index}. <code>${formattedNum}</code> ❌ Banned`;
                banned++;
            } else {
                statusLine = `${index}. <code>${formattedNum}</code> ✅ Fresh Num`;
                fresh++;
            }

            await bot.sendMessage(chatId, statusLine, { parse_mode: "HTML" });

        } catch (e) {
            await bot.sendMessage(chatId, `${index}. <code>${formattedNum}</code> ⚠️ Error`, { parse_mode: "HTML" });
        }
        index++;
        await new Promise(res => setTimeout(res, 500));
    }
    
    bot.editMessageText(`<b>✅ Check Completed!</b>\n\n📊 Results:\n❌ Banned: ${banned}\n✅ Fresh: ${fresh}\n📱 Total: ${finalNumbers.length}`, {
        chat_id: chatId,
        message_id: processingMsg.message_id,
        parse_mode: "HTML"
    });
});

console.log("🤖 Bot started on Render!");