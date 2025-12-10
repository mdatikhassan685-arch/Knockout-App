const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, amount, method, account_number, sender_number, trx_id } = req.body;

    try {
        // ========== WALLET INFO ==========
        if (type === 'wallet_info') {
            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const [transactions] = await db.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [user_id]);
            return res.status(200).json({
                balance: user[0]?.wallet_balance || 0,
                transactions
            });
        }

        // ========== DEPOSIT REQUEST ==========
        if (type === 'deposit') {
            if (!amount || !sender_number || !trx_id) return res.status(400).json({ error: 'Missing fields' });
            
            await db.execute(
                'INSERT INTO deposits (user_id, amount, sender_number, trx_id, status) VALUES (?, ?, ?, ?, "pending")',
                [user_id, amount, sender_number, trx_id]
            );
            return res.status(200).json({ success: true, message: 'Deposit request sent!' });
        }

        // ========== WITHDRAW REQUEST ==========
        if (type === 'withdraw') {
            if (!amount || !account_number) return res.status(400).json({ error: 'Missing fields' });

            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            if (user[0].wallet_balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

            await db.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status) VALUES (?, ?, ?, ?, "pending")',
                [user_id, amount, method, account_number]
            );
            return res.status(200).json({ success: true, message: 'Withdraw request sent!' });
        }

        // Default
        return res.status(400).json({ error: 'Invalid type' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: error.message });
    }
};
