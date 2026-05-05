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
        <h1>🤖 WhatsApp Number Checker Bot</h1>
        <p>Status: 🟢 Running</p>
        <p>Bot is active and waiting for commands</p>
    `);
});

app.listen(port, () => {
    console.log(`✅ Web server running on port ${port}`);
});

// Telegram Bot Token (আপডেটেড)
const tgToken = "8592295552:AAHImGm7CZXQ1K-3vc9zuRFSukBfs8KMnhw";
const bot = new TelegramBot(tgToken, { polling: true });

let sock = null;
let isConnected = false;
let reconnectAttempts = 0;

async function startBot() {
    try {
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
                console.log("📱 Scan this QR code:");
                QRCode.generate(qr, { small: true });
                reconnectAttempts = 0;
            }
            
            if (connection === "open") {
                isConnected = true;
                reconnectAttempts = 0;
                console.log("✅ WhatsApp Connected!");
                bot.sendMessage(6074977440, "✅ Bot is online on Render!").catch(e => console.log("Can't send message"));
            }
            
            if (connection === "close") {
                isConnected = false;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ Disconnected (${statusCode}), reconnecting in ${Math.min(5000 * ++reconnectAttempts, 30000)}ms...`);
                setTimeout(startBot, Math.min(5000 * reconnectAttempts, 30000));
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

📌 How to use:
Send US/Canada numbers in any format:
• 1639-399-4079
• 16393994079
• 1-639-399-4079

📊 Bot Status: ${isConnected ? '✅ Active' : '⏳ Connecting...'}

Example:
1639-399-4079 1639-398-0764`);
    }

    // Extract numbers
    const rawNumbers = text.split(/\s+/);
    const finalNumbers = [];

    for (let item of rawNumbers) {
        let clean = item.replace(/\D/g, "");
        if (clean.length === 10) {
            finalNumbers.push("1" + clean);
        } else if (clean.length === 11 && clean.startsWith("1")) {
            finalNumbers.push(clean);
        }
    }

    if (finalNumbers.length === 0) {
        return bot.sendMessage(chatId, "❌ No valid numbers found!\n\nSend numbers like: 1639-399-4079");
    }

    if (!isConnected || !sock) {
        return bot.sendMessage(chatId, "⏳ WhatsApp connecting... Please wait 1-2 minutes and try again.");
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
            await bot.sendMessage(chatId, `${index}. ⚠️ ${formattedNum} - Error checking`);
            fresh++;
        }
        index++;
        await new Promise(res => setTimeout(res, 500));
    }
    
    await bot.editMessageText(`✅ Check Completed!\n\n📊 Results:\n❌ Banned: ${banned}\n✅ Fresh: ${fresh}\n📱 Total: ${finalNumbers.length}`, {
        chat_id: chatId,
        message_id: processingMsg.message_id
    });
});

console.log("🤖 Bot started successfully!");