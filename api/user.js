const pool = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, userId, catId, tournamentId } = req.body;

    try {
        if (type === 'home') {
            const [user] = await pool.execute('SELECT wallet_balance FROM users WHERE id = ?', [userId]);
            const [cats] = await pool.query('SELECT * FROM tournaments WHERE is_category = 1 ORDER BY id DESC');
            const [banners] = await pool.query('SELECT * FROM banners ORDER BY sort_order');
            return res.json({ success: true, user: user[0], categories: cats, banners });
        }

        if (type === 'category-tournaments') {
            const [cat] = await pool.execute('SELECT title FROM tournaments WHERE id = ?', [catId]);
            const [tournaments] = await pool.execute('SELECT * FROM tournaments WHERE parent_id = ? AND is_category = 0', [catId]);
            return res.json({ success: true, category: cat[0], tournaments });
        }

        if (type === 'tournament-details') {
            const [t] = await pool.execute('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
            const [joined] = await pool.execute('SELECT COUNT(*) as count FROM teams WHERE tournament_id = ?', [tournamentId]);
            const [isJoined] = await pool.execute('SELECT id FROM teams WHERE tournament_id = ? AND leader_user_id = ?', [tournamentId, userId]);
            return res.json({ success: true, tournament: t[0], joinedCount: joined[0].count, isJoined: isJoined.length > 0 });
        }
        
        // Wallet logic can be added here similarly...

    } catch (error) { res.status(500).json({ error: error.message }); }
};
