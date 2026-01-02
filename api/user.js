const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const body = req.body || {};
    const { type, user_id, amount, details } = body;

    try {
        // --- ১. ইউজার প্রোফাইল ও ব্যালেন্স দেখা ---
        if (type === 'get_profile') {
            const [rows] = await db.execute('SELECT id, name, email, wallet_balance FROM users WHERE id = ?', [user_id]);
            return res.status(200).json(rows[0]);
        }

        // --- ২. টাকা জমার রিকোয়েস্ট (Add Money/Deposit) ---
        if (type === 'submit_deposit') {
            if (!user_id || !amount || !details) {
                return res.status(400).json({ error: 'সব তথ্য দিন (Amount and Transaction Details required)' });
            }

            // এখানে আমরা নিশ্চিত করছি যে 'type' কলামে 'deposit' সেভ হচ্ছে
            await db.execute(
                'INSERT INTO transactions (user_id, amount, type, details, status) VALUES (?, ?, ?, ?, ?)',
                [user_id, amount, 'deposit', details, 'pending']
            );

            return res.status(200).json({ success: true, message: 'Deposit request submitted!' });
        }

        // --- ৩. টাকা তোলার রিকোয়েস্ট (Withdrawal) ---
        if (type === 'submit_withdrawal') {
            const { method, account_number } = body;

            // আগে চেক করি ইউজারের যথেষ্ট ব্যালেন্স আছে কি না
            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            
            if (user[0].wallet_balance < amount) {
                return res.status(400).json({ error: 'আপনার যথেষ্ট ব্যালেন্স নেই!' });
            }

            // ইউজারের ব্যালেন্স থেকে টাকা কেটে নেওয়া
            await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [amount, user_id]);

            // উইথড্র রিকোয়েস্ট সেভ করা
            await db.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status) VALUES (?, ?, ?, ?, ?)',
                [user_id, amount, method, account_number, 'pending']
            );

            return res.status(200).json({ success: true, message: 'Withdrawal request submitted!' });
        }

        return res.status(400).json({ error: 'Unknown Type' });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};
