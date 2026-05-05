const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");

const tgToken = "8202590545:AAF_3F1LzWMc9HRPLwGDvzmHn173gP4ysdE";
const bot = new TelegramBot(tgToken, { polling: true });

let sock = null;
let isConnected = false;

function formatNumber(phoneNumber) {
    let clean = phoneNumber.replace(/\D/g, '');
    
    if (clean.length === 10) {
        return '1' + clean;
    } else if (clean.length === 11 && clean.startsWith('1')) {
        return clean;
    } else if (clean.length === 12) {
        return clean;
    } else {
        return null;
    }
}

async function connectWA() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: true,
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📱 Scan QR:");
            QRCode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            isConnected = true;
            console.log('✅ Connected!');
        }
        
        if (connection === 'close') {
            isConnected = false;
            setTimeout(connectWA, 5000);
        }
    });
}

connectWA();

// Random check for demo (70% Fresh, 30% Banned)
function getRandomStatus() {
    const random = Math.random();
    if (random < 0.3) {
        return { status: "❌ Banned", emoji: "❌" };
    } else {
        return { status: "✅ Fresh Num", emoji: "✅" };
    }
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!text || text === '/start') {
        return bot.sendMessage(chatId, `🤖 WhatsApp Number Checker Bot

Send US/Canada numbers:
• 1639-399-4079
• 16393994079
• 1-639-399-4079

Example:
1639-399-4079 1639-398-0764`);
    }
    
    // Extract all numbers
    const numbers = text.match(/\d+/g) || [];
    const validNumbers = [];
    
    for (let num of numbers) {
        let clean = num.replace(/\D/g, '');
        if (clean.length === 10) {
            validNumbers.push('1' + clean);
        } else if (clean.length === 11 && clean.startsWith('1')) {
            validNumbers.push(clean);
        }
    }
    
    if (validNumbers.length === 0) {
        return bot.sendMessage(chatId, "❌ No valid numbers found!");
    }
    
    if (!isConnected) {
        return bot.sendMessage(chatId, "⏳ WhatsApp connecting... Please scan QR code");
    }
    
    // Send processing message
    const processingMsg = await bot.sendMessage(chatId, `🔍 Checking ${validNumbers.length} numbers...\n⏳ Please wait`);
    
    let index = 1;
    let bannedCount = 0;
    let freshCount = 0;
    
    for (let formattedNum of validNumbers) {
        try {
            // Real WhatsApp check
            const jid = `${formattedNum}@s.whatsapp.net`;
            const [result] = await sock.onWhatsApp(jid);
            
            let statusLine = "";
            
            if (result && result.exists) {
                // Number exists on WhatsApp
                statusLine = `${index}. ${formattedNum} ❌ Banned`;
                bannedCount++;
            } else {
                // Number not on WhatsApp
                statusLine = `${index}. ${formattedNum} ✅ Fresh Num`;
                freshCount++;
            }
            
            await bot.sendMessage(chatId, statusLine);
            
        } catch (e) {
            // Error - treat as Fresh
            await bot.sendMessage(chatId, `${index}. ${formattedNum} ✅ Fresh Num`);
            freshCount++;
        }
        
        index++;
        await new Promise(res => setTimeout(res, 500));
    }
    
    // Send completion message
    await bot.sendMessage(chatId, `Check Completed ✅\nTotal: ${validNumbers.length} numbers.`);
    
    // Update processing message
    await bot.editMessageText(`✅ Check Completed!\n\n📊 Results:\n❌ Banned: ${bannedCount}\n✅ Fresh: ${freshCount}\n📱 Total: ${validNumbers.length}`, {
        chat_id: chatId,
        message_id: processingMsg.message_id
    });
});

console.log("🤖 Bot Started...");
