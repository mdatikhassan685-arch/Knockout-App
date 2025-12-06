const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { tournamentId, userId } = req.body;

    if (!tournamentId) return res.status(400).json({ error: 'Tournament ID required' });

    try {
        // ১. টুর্নামেন্ট ইনফো
        const [rows] = await pool.execute('SELECT * FROM tournaments WHERE id = ?', [tournamentId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Tournament not found' });
        const tournament = rows[0];

        // ২. স্লট গণনা (Total Teams Joined)
        const [countRows] = await pool.execute(
            'SELECT COUNT(*) as joined FROM teams WHERE tournament_id = ?', 
            [tournamentId]
        );
        const joinedCount = countRows[0].joined;

        // ৩. ইউজার অলরেডি জয়েন করেছে কিনা
        // আমরা চেক করব ইউজার কি কোনো টিমের লিডার হিসেবে আছে কিনা
        const [checkUser] = await pool.execute(
            'SELECT id FROM teams WHERE tournament_id = ? AND leader_user_id = ?',
            [tournamentId, userId]
        );
        const isJoined = checkUser.length > 0;

        // ৪. শিডিউল (ম্যাচ ডে)
        const [schedule] = await pool.execute(
            'SELECT * FROM match_days WHERE tournament_id = ? ORDER BY start_datetime ASC',
            [tournamentId]
        );

        res.status(200).json({
            success: true,
            tournament,
            joinedCount,
            isJoined,
            schedule
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
};
