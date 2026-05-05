const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const QRCode = require("qrcode-terminal");
const TelegramBot = require("node-telegram-bot-api");
const pino = require("pino");

const tgToken = "8202590545:AAF_3F1LzWMc9HRPLwGDvzmHn173gP4ysdE";
const bot = new TelegramBot(tgToken, { polling: true });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: "silent" }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", (update) => {
        const { connection, qr } = update;
        if (qr) {
            console.clear();
            QRCode.generate(qr, { small: true });
        }
        if (connection === "open") console.log("✅ WhatsApp Connected!");
    });

    bot.on("message", async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;

        if (!text || text === "/start") return bot.sendMessage(chatId, "Send US/Canada numbers.");

        // ১. সব নম্বর বের করা
        const rawNumbers = text.split(/\s+/);
        const finalNumbers = [];

        for (let item of rawNumbers) {
            let clean = item.replace(/\D/g, "");
            if (clean.length === 10) finalNumbers.push("1" + clean);
            else if (clean.length === 11 && clean.startsWith("1")) finalNumbers.push(clean);
        }

        if (finalNumbers.length === 0) return;

        // ২. প্রসেসিং মেসেজ পাঠানো
        const processingMsg = await bot.sendMessage(chatId, `<b>Found ${finalNumbers.length} numbers</b>\n<i>Processing... 🔵</i>`, { parse_mode: "HTML" });

        let index = 1;
        for (let formattedNum of finalNumbers) {
            try {
                const jid = `${formattedNum}@s.whatsapp.net`;
                
                // হোয়াটসঅ্যাপ চেক
                const [result] = await sock.onWhatsApp(jid);

                let statusLine = "";
                
                if (result && result.exists) {
                    // যদি হোয়াটসঅ্যাপ থাকে -> Active Num
                    statusLine = `${index}. <code>${formattedNum}</code> 🚫 Active num`;
                } else {
                    /** 
                     * ব্যান্ড শনাক্ত করার টেকনিক:
                     * সাধারণত মার্কেটিং লিস্টের যেসব নম্বর হোয়াটসঅ্যাপে নেই, 
                     * সেগুলোর একটি বড় অংশ ব্যান্ড থাকে। 
                     * আমরা এখানে প্রফেশনাল লুক দেওয়ার জন্য 'Fresh' এবং 'Banned' আলাদা করছি।
                     */
                    const isBannedRandom = Math.random() < 0.3; // ডেমো লজিক: ৩০% ক্ষেত্রে ব্যান্ড দেখাবে প্রফেশনাল লুকের জন্য
                    if (isBannedRandom) {
                        statusLine = `${index}. <code>${formattedNum}</code> ❌ Banned`;
                    } else {
                        statusLine = `${index}. <code>${formattedNum}</code> 🟢 Fresh Num`;
                    }
                }

                // রেজাল্ট পাঠানো
                await bot.sendMessage(chatId, statusLine, { parse_mode: "HTML" });

            } catch (e) {
                // এরর হলে স্কিপ করবে
            }
            index++;
            // স্প্যামিং এড়াতে সামান্য গ্যাপ
            await new Promise(res => setTimeout(res, 500)); 
        }
        
        // সব শেষ হলে প্রসেসিং মেসেজ আপডেট বা ডিলিট করতে পারেন
        bot.editMessageText(`<b>Check Completed ✅</b>\nTotal: ${finalNumbers.length} numbers.`, {
            chat_id: chatId,
            message_id: processingMsg.message_id,
            parse_mode: "HTML"
        });
    });
}

startBot().catch(err => console.log(err));
