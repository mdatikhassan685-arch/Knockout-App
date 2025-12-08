const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId } = req.body;

    try {
        // ১. ইউজার ইনফো
        const [userRows] = await pool.execute('SELECT wallet_balance, username FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });

        // ২. নোটিফিকেশন কাউন্ট
        const [notifRows] = await pool.execute('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);

        // ৩. ব্যানার
        const [banners] = await pool.query('SELECT * FROM banners ORDER BY sort_order ASC');

        // ৪. ক্যাটাগরি লিস্ট (যাদের is_category = 1)
        // আমরা চেক করব এটা অফিসিয়াল নাকি নরমাল
        const [categories] = await pool.query('SELECT * FROM tournaments WHERE is_category = 1 ORDER BY id DESC');

        res.status(200).json({
            success: true,
            user: userRows[0],
            unread_notif: notifRows[0].count,
            banners,
            categories
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
