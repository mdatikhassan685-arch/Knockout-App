const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, depositId, status, adminId } = req.body;

    try {
        // ১. অ্যাডমিন ভেরিফিকেশন
        const [adminCheck] = await pool.execute('SELECT role FROM users WHERE id = ?', [adminId]);
        if (adminCheck.length === 0 || adminCheck[0].role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // ২. লিস্ট লোড করা (যদি action না থাকে)
        if (!action) {
            const [rows] = await pool.query(`
                SELECT d.id, u.username, d.amount, d.sender_number, d.trx_id, d.created_at 
                FROM deposits d 
                JOIN users u ON d.user_id = u.id 
                WHERE d.status = 'pending' 
                ORDER BY d.created_at ASC
            `);
            return res.status(200).json({ success: true, deposits: rows });
        }

        // ৩. স্ট্যাটাস আপডেট (Approve/Reject)
        if (action === 'update') {
            // ইউজারের ব্যালেন্স বাড়ানোর জন্য আগে user_id ও amount দরকার
            const [dep] = await pool.execute('SELECT user_id, amount FROM deposits WHERE id = ?', [depositId]);
            
            if (dep.length === 0) return res.status(404).json({ error: 'Request not found' });

            if (status === 'approved') {
                // ব্যালেন্স আপডেট
                await pool.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [dep[0].amount, dep[0].user_id]);
                // ট্রানজেকশন লগ
                await pool.execute('INSERT INTO transactions (user_id, amount, type, details) VALUES (?, ?, "Deposit", ?)', [dep[0].user_id, dep[0].amount, "Approved by Admin"]);
            }

            // ডিপোজিট স্ট্যাটাস আপডেট
            await pool.execute('UPDATE deposits SET status = ? WHERE id = ?', [status, depositId]);

            return res.status(200).json({ success: true, message: `Deposit ${status}` });
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
