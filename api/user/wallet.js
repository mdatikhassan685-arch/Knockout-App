const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS & Method Check...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId, action, amount, senderNumber, trxId, method, accountNumber } = req.body;

    try {
        // ১. ওয়ালেট ব্যালেন্স ও ট্রানজেকশন হিস্ট্রি দেখা
        if (!action) {
            const [user] = await pool.execute('SELECT wallet_balance FROM users WHERE id = ?', [userId]);
            const [history] = await pool.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC', [userId]);
            
            return res.status(200).json({
                success: true,
                balance: user[0].wallet_balance,
                transactions: history
            });
        }

        // ২. ডিপোজিট রিকোয়েস্ট (Add Money)
        if (action === 'deposit') {
            await pool.execute(
                'INSERT INTO deposits (user_id, amount, sender_number, trx_id, status) VALUES (?, ?, ?, ?, "pending")',
                [userId, amount, senderNumber, trxId]
            );
            return res.status(200).json({ success: true, message: 'Deposit request submitted!' });
        }

        // ৩. উইথড্র রিকোয়েস্ট (Withdraw Money)
        if (action === 'withdraw') {
            // ব্যালেন্স চেক
            const [user] = await pool.execute('SELECT wallet_balance FROM users WHERE id = ?', [userId]);
            if (user[0].wallet_balance < amount) {
                return res.status(400).json({ error: 'Insufficient balance' });
            }

            await pool.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status) VALUES (?, ?, ?, ?, "pending")',
                [userId, amount, method, accountNumber]
            );
            return res.status(200).json({ success: true, message: 'Withdrawal request submitted!' });
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
