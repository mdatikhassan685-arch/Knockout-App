const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId, action, amount, senderNumber, trxId, method, accountNumber } = req.body;

    try {
        // ১. ব্যালেন্স লোড (Fast Query)
        if (!action) {
            const [data] = await pool.query(`
                SELECT 
                    (SELECT wallet_balance FROM users WHERE id = ?) as balance,
                    (SELECT JSON_ARRAYAGG(JSON_OBJECT('type', type, 'amount', amount, 'created_at', created_at)) 
                     FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10) as transactions
            `, [userId, userId]);
            
            return res.status(200).json({
                success: true,
                balance: data[0].balance,
                transactions: data[0].transactions || []
            });
        }

        // ২. ডিপোজিট রিকোয়েস্ট
        if (action === 'deposit') {
            await pool.execute(
                'INSERT INTO deposits (user_id, amount, sender_number, trx_id, status) VALUES (?, ?, ?, ?, "pending")',
                [userId, amount, senderNumber, trxId]
            );
            return res.status(200).json({ success: true, message: 'Request Sent' });
        }

        // ৩. উইথড্র রিকোয়েস্ট (Fixed)
        if (action === 'withdraw') {
            const [user] = await pool.execute('SELECT wallet_balance FROM users WHERE id = ?', [userId]);
            
            if (!user[0] || parseFloat(user[0].wallet_balance) < parseFloat(amount)) {
                return res.status(400).json({ error: 'Insufficient Balance' });
            }

            await pool.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status) VALUES (?, ?, ?, ?, "pending")',
                [userId, amount, method, accountNumber]
            );
            return res.status(200).json({ success: true, message: 'Withdraw Request Sent' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
