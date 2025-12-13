const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, category_id, user_id, tournament_id, game_name, game_uid, game_level } = req.body;

    try {
        // ============================
        // 1. GET MATCHES (User View) - FIXED
        // ============================
        if (type === 'get_matches') {
            // ইউজারের জয়েন স্ট্যাটাস চেক করার জন্য সাব-কুয়েরি ব্যবহার করা হচ্ছে
            const [matches] = await db.execute(`
                SELECT t.*, 
                (SELECT COUNT(*) FROM participants p WHERE p.tournament_id = t.id) as joined_count,
                (SELECT COUNT(*) FROM participants p WHERE p.tournament_id = t.id AND p.user_id = ?) as is_joined
                FROM tournaments t 
                WHERE t.category_id = ? 
                ORDER BY t.schedule_time DESC
            `, [user_id, category_id]);

            return res.status(200).json(matches);
        }

        // ============================
        // 2. JOIN MATCH (Strict Duplicate Check)
        // ============================
        if (type === 'join_match') {
            if (!game_name || !game_uid || !game_level) return res.status(400).json({ error: 'All fields required!' });
            if (parseInt(game_level) < 40) return res.status(400).json({ error: 'Minimum Level 40 required!' });

            // ১. চেক করুন ইউজার আগে জয়েন করেছে কিনা
            const [checkJoin] = await db.execute('SELECT id FROM participants WHERE user_id = ? AND tournament_id = ?', [user_id, tournament_id]);
            if (checkJoin.length > 0) {
                return res.status(400).json({ error: 'You have already joined this match!' });
            }

            // ২. ম্যাচ এবং ইউজার ডাটা আনুন
            const [matchData] = await db.execute('SELECT entry_fee, total_spots FROM tournaments WHERE id = ?', [tournament_id]);
            if (matchData.length === 0) return res.status(404).json({ error: 'Match not found' });
            
            const match = matchData[0];
            const [countJoin] = await db.execute('SELECT COUNT(*) as c FROM participants WHERE tournament_id = ?', [tournament_id]);
            const [userData] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const user = userData[0];

            if (countJoin[0].c >= match.total_spots) return res.status(400).json({ error: 'Match is Full!' });
            if (parseFloat(user.wallet_balance) < parseFloat(match.entry_fee)) return res.status(400).json({ error: 'Insufficient Balance!' });

            // ৩. জয়েন প্রসেস
            await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [match.entry_fee, user_id]);
            
            await db.execute(
                'INSERT INTO participants (user_id, tournament_id, in_game_name, in_game_uid, game_level, joined_at) VALUES (?, ?, ?, ?, ?, NOW())', 
                [user_id, tournament_id, game_name, game_uid, game_level]
            );
            
            await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Match Join", NOW())', [user_id, match.entry_fee]);

            return res.status(200).json({ success: true, message: 'Joined Successfully' });
        }

        // ... (get_room অংশ আগের মতোই থাকবে) ...
        if (type === 'get_room') {
            const [check] = await db.execute('SELECT id FROM participants WHERE user_id = ? AND tournament_id = ?', [user_id, tournament_id]);
            if (check.length > 0) {
                const [room] = await db.execute('SELECT room_id, room_pass FROM tournaments WHERE id = ?', [tournament_id]);
                return res.status(200).json(room[0]);
            } else {
                return res.status(403).json({ error: 'Not joined' });
            }
        }
        // ============================
        // 4. GET MATCH RESULT (Fix Rank Keyword)
        // ============================
        if (type === 'get_result_board') {
            const { tournament_id } = req.body;
            
            // ✅ FIX: `rank` শব্দটিতে ব্যাকটিক ব্যবহার করা হয়েছে
            const [results] = await db.execute(`
                SELECT in_game_name, kills, \`rank\`, prize_won 
                FROM participants 
                WHERE tournament_id = ? 
                ORDER BY \`rank\` ASC, kills DESC
            `, [tournament_id]);
            
            return res.status(200).json(results);
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
