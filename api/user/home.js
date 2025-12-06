const pool = require('../../db');

module.exports = async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId } = req.body;

    try {
        // ১. ইউজারের ব্যালেন্স আনা
        const [userRows] = await pool.execute('SELECT wallet_balance, username FROM users WHERE id = ?', [userId]);
        if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });

        // ২. নোটিফিকেশন কাউন্ট
        const [notifRows] = await pool.execute('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);

        // ৩. ব্যানার আনা
        const [banners] = await pool.query('SELECT * FROM banners ORDER BY sort_order ASC');

        // ৪. টুর্নামেন্ট লিস্ট আনা
        const [tournaments] = await pool.query('SELECT * FROM tournaments WHERE status = "open" ORDER BY id DESC');

        res.status(200).json({
            success: true,
            user: userRows[0],
            unread_notif: notifRows[0].count,
            banners,
            tournaments
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
