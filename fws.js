const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");

const tgToken = "8202590545:AAF_3F1LzWMc9HRPLwGDvzmHn173gP4ysdE";
const bot = new TelegramBot(tgToken, { polling: true });

let sock = null;
let isConnected = false;

async function connectWA() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();
    
    sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true, // এইটা QR নিজেই দেখাবে
        browser: ["MyBot", "Chrome", "1.0"]
    });
    
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log("📱 এই QR কোড স্ক্যান করুন:");
            QRCode.generate(qr, { small: true });
        }
        
        if (connection === 'open') {
            isConnected = true;
            console.log('✅ হোয়াটসঅ্যাপ কানেক্টেড!');
            bot.sendMessage(6074977440, "✅ বট চালু আছে!");
        }
        
        if (connection === 'close') {
            isConnected = false;
            console.log('❌ সংযোগ বিচ্ছিন্ন, পুনরায় সংযোগ হচ্ছে...');
            setTimeout(connectWA, 5000);
        }
    });
}

connectWA();

// টেলিগ্রাম মেসেজ হ্যান্ডলার
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    
    if (!text || text === '/start') {
        return bot.sendMessage(chatId, "🇺🇸🇨🇦 নম্বর পাঠান:\n উদাহরণ: 1234567890");
    }
    
    if (!isConnected) {
        return bot.sendMessage(chatId, "⏳ হোয়াটসঅ্যাপ কানেক্ট হচ্ছে, একটু অপেক্ষা করুন...");
    }
    
    // নম্বর বের করা
    const numbers = text.match(/\d+/g) || [];
    const validNumbers = [];
    
    for (let num of numbers) {
        let clean = num.replace(/\D/g, '');
        if (clean.length === 10) validNumbers.push('1' + clean);
        else if (clean.length === 11 && clean.startsWith('1')) validNumbers.push(clean);
    }
    
    if (validNumbers.length === 0) {
        return bot.sendMessage(chatId, "❌ কোনো বৈধ নম্বর পাওয়া যায়নি!");
    }
    
    await bot.sendMessage(chatId, `🔍 ${validNumbers.length}টি নম্বর চেক করা হচ্ছে...`);
    
    for (let i = 0; i < validNumbers.length; i++) {
        const num = validNumbers[i];
        try {
            const jid = num + '@s.whatsapp.net';
            const [result] = await sock.onWhatsApp(jid);
            
            if (result?.exists) {
                await bot.sendMessage(chatId, `${i+1}. ✅ ${num} - WhatsApp Active`);
            } else {
                await bot.sendMessage(chatId, `${i+1}. ❌ ${num} - Not on WhatsApp`);
            }
        } catch (err) {
            await bot.sendMessage(chatId, `${i+1}. ⚠️ ${num} - Error checking`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    
    await bot.sendMessage(chatId, "✅ চেক সম্পূর্ণ!");
});
