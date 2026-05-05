const { default: makeWASocket, useMultiFileAuthState } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");

const tgToken = "8202590545:AAF_3F1LzWMc9HRPLwGDvzmHn173gP4ysdE";
const bot = new TelegramBot(tgToken, { polling: true });

let sock = null;
let qrCode = null;

async function connectWA() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ["Chrome (Linux)", "", ""]
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCode = qr;
            console.log("📱 Scan this QR with WhatsApp:");
            QRCode.generate(qr, { small: true });
            console.log("\nOr copy this link in browser:\n", qr);
        }
        
        if (connection === 'open') {
            console.log('✅ WhatsApp Connected!');
            bot.sendMessage(6074977440, "✅ Bot is online!");
        }
        
        if (connection === 'close') {
            console.log('❌ Disconnected, reconnecting...');
            setTimeout(connectWA, 5000);
        }
    });
}

connectWA();

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!text || text === '/start') {
        return bot.sendMessage(chatId, "Send US/Canada numbers:\nExample: 1234567890");
    }
    
    const numbers = text.match(/\d+/g) || [];
    const validNumbers = [];
    
    for (let num of numbers) {
        let clean = num.replace(/\D/g, '');
        if (clean.length === 10) validNumbers.push('1' + clean);
        else if (clean.length === 11 && clean.startsWith('1')) validNumbers.push(clean);
    }
    
    if (validNumbers.length === 0) {
        return bot.sendMessage(chatId, "❌ No valid numbers found!");
    }
    
    if (!sock) {
        return bot.sendMessage(chatId, "⏳ WhatsApp connecting, wait...");
    }
    
    await bot.sendMessage(chatId, `🔍 Checking ${validNumbers.length} numbers...`);
    
    for (let i = 0; i < validNumbers.length; i++) {
        const num = validNumbers[i];
        try {
            const [result] = await sock.onWhatsApp(`${num}@s.whatsapp.net`);
            
            if (result?.exists) {
                await bot.sendMessage(chatId, `${i+1}. ✅ ${num} - WhatsApp Active`);
            } else {
                await bot.sendMessage(chatId, `${i+1}. ❌ ${num} - Not on WhatsApp`);
            }
        } catch (err) {
            await bot.sendMessage(chatId, `${i+1}. ⚠️ ${num} - Error`);
        }
        await new Promise(r => setTimeout(r, 800));
    }
    
    await bot.sendMessage(chatId, "✅ Check complete!");
});
