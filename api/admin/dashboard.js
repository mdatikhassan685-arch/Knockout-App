const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { adminId } = req.body;

    try {
        // ১. অ্যাডমিন ভেরিফিকেশন
        const [adminCheck] = await pool.execute('SELECT role FROM users WHERE id = ?', [adminId]);
        if (adminCheck.length === 0 || adminCheck[0].role !== 'admin') {
            return res.status(403).json({ error: 'Unauthorized Access' });
        }

        // ২. ড্যাশবোর্ড স্ট্যাটাস (একসাথে সব কুয়েরি)
        const [users] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = "user"');
        const [deposits] = await pool.query('SELECT COUNT(*) as count FROM deposits WHERE status = "pending"');
        const [withdrawals] = await pool.query('SELECT COUNT(*) as count FROM withdrawals WHERE status = "pending"');
        const [tournaments] = await pool.query('SELECT COUNT(*) as count FROM tournaments');

        // ৩. লেটেস্ট ডিপোজিট রিকোয়েস্ট (৫টি)
        const [recentDeposits] = await pool.query(`
            SELECT d.id, u.username, d.amount, d.created_at 
            FROM deposits d 
            JOIN users u ON d.user_id = u.id 
            WHERE d.status = 'pending' 
            ORDER BY d.created_at DESC LIMIT 5
        `);

        return res.status(200).json({
            success: true,
            stats: {
                totalUsers: users[0].count,
                pendingDeposits: deposits[0].count,
                pendingWithdrawals: withdrawals[0].count,
                totalTournaments: tournaments[0].count
            },
            recentDeposits
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
