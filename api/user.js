const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const body = req.body || {};
    const { type, user_id, amount, sender_number, trx_id } = body;

    try {
        // --- ১. ডিপোজিট রিকোয়েস্ট (আপনার দেওয়া টেবিল কলাম অনুযায়ী) ---
        if (type === 'deposit') {
            if (!user_id || !amount || !sender_number || !trx_id) {
                return res.status(400).json({ error: 'সবগুলো ঘর পূরণ করুন!' });
            }

            // এখানে আপনার deposits টেবিলের কলাম নাম অনুযায়ী ডাটা ইনসার্ট হচ্ছে
            const sql = `INSERT INTO deposits (user_id, amount, sender_number, trx_id, status) 
                         VALUES (?, ?, ?, ?, 'pending')`;
            
            await db.execute(sql, [user_id, amount, sender_number, trx_id]);

            return res.status(200).json({ success: true });
        }

        // --- ২. উইথড্র রিকোয়েস্ট ---
        if (type === 'withdraw') {
            const { method, account_number } = body;

            const [uRows] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            if (uRows.length === 0 || uRows[0].wallet_balance < amount) {
                return res.status(400).json({ error: 'পর্যাপ্ত ব্যালেন্স নেই!' });
            }

            await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [amount, user_id]);

            await db.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status) VALUES (?, ?, ?, ?, "pending")',
                [user_id, amount, method, account_number, 'pending']
            );

            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown Type: ' + type });

    } catch (e) {
        console.error("API Error:", e);
        return res.status(500).json({ error: e.message });
    }
};
