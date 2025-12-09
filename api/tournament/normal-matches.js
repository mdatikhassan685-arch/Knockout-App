const pool = require('../../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { catId, userId } = req.body;

    try {
        // ১. ম্যাচ লিস্ট আনা
        const [matches] = await pool.execute(`
            SELECT t.*, 
            (SELECT COUNT(*) FROM participants WHERE tournament_id = t.id) as joined_count,
            (SELECT COUNT(*) FROM participants WHERE tournament_id = t.id AND user_id = ?) as is_joined
            FROM tournaments t 
            WHERE t.parent_id = ? AND t.is_category = 0 
            ORDER BY t.start_time DESC
        `, [userId, catId]);

        res.json({ success: true, matches });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
