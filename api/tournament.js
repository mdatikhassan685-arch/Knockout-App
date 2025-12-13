const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, category_id, user_id, tournament_id, game_name } = req.body;

    try {
        // ১. নির্দিষ্ট ক্যাটাগরির ম্যাচগুলো আনা (সাথে ইউজার জয়েন আছে কিনা চেক করা)
        if (type === 'get_matches') {
            const [matches] = await db.execute(`
                SELECT t.*, 
                (SELECT COUNT(*) FROM participants p WHERE p.tournament_id = t.id) as joined_count,
                (SELECT COUNT(*) FROM participants p WHERE p.tournament_id = t.id AND p.user_id = ?) as is_joined
                FROM tournaments t 
                WHERE t.category_id = ? 
                ORDER BY t.schedule_time ASC
            `, [user_id, category_id]);

            return res.status(200).json(matches);
        }

        // ২. ম্যাচে জয়েন করা
        if (type === 'join_match') {
            if (!game_name) return res.status(400).json({ error: 'Game Name/ID required!' });

            // ব্যালেন্স এবং সিট চেক
            const [matchData] = await db.execute('SELECT entry_fee, total_spots FROM tournaments WHERE id = ?', [tournament_id]);
            const [userData] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const [joinedData] = await db.execute('SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?', [tournament_id]);
            const [alreadyJoined] = await db.execute('SELECT id FROM participants WHERE user_id = ? AND tournament_id = ?', [user_id, tournament_id]);

            const match = matchData[0];
            const user = userData[0];

            if (alreadyJoined.length > 0) return res.status(400).json({ error: 'Already Joined!' });
            if (joinedData[0].count >= match.total_spots) return res.status(400).json({ error: 'Match Full!' });
            if (user.wallet_balance < match.entry_fee) return res.status(400).json({ error: 'Insufficient Balance!' });

            // টাকা কাটা এবং জয়েন করানো
            await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [match.entry_fee, user_id]);
            await db.execute('INSERT INTO participants (user_id, tournament_id, game_name, created_at) VALUES (?, ?, ?, NOW())', [user_id, tournament_id, game_name]);
            await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Match Join Fee", NOW())', [user_id, match.entry_fee]);

            return res.status(200).json({ success: true, message: 'Joined Successfully!' });
        }

        // ৩. রুম আইডি দেখা (শুধুমাত্র যারা জয়েন করেছে)
        if (type === 'get_room') {
            const [check] = await db.execute('SELECT id FROM participants WHERE user_id = ? AND tournament_id = ?', [user_id, tournament_id]);
            if (check.length === 0) return res.status(403).json({ error: 'Join match first!' });

            const [room] = await db.execute('SELECT room_id, room_pass FROM tournaments WHERE id = ?', [tournament_id]);
            return res.status(200).json(room[0]);
        }

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
