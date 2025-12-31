const db = require('../db');

module.exports = async (req, res) => {
    // 1. Basic Setup (CORS & Headers)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

    // Body Parsing
    const body = req.body || {};
    const { type, category_id, id, match_id } = body;

    // Safety Check
    if (!type) return res.status(400).json({ error: 'Type is missing' });

    try {
        // --- 🎮 GET CATEGORIES ---
        if (type === 'get_categories') {
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
            return res.status(200).json(rows);
        }

        // --- ➕ ADD CATEGORY ---
        if (type === 'add_category') {
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, ?)', 
                [body.title, body.image, body.cat_type || 'normal', 'open']);
            return res.status(200).json({ success: true });
        }

        // --- ✏️ EDIT CATEGORY ---
        if (type === 'edit_category') {
            await db.execute('UPDATE categories SET title=?, image=?, type=? WHERE id=?', 
                [body.title, body.image, body.cat_type, body.id]);
            return res.status(200).json({ success: true });
        }

        // --- ❌ DELETE CATEGORY ---
        if (type === 'delete_category') {
            await db.execute('DELETE FROM match_participants WHERE match_id IN (SELECT id FROM matches WHERE category_id = ?)', [id]);
            await db.execute('DELETE FROM matches WHERE category_id = ?', [id]);
            await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        // --- 🔥 GET MATCHES (SAFE) ---
        if (type === 'get_admin_matches') {
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
            let params = [];
            if (category_id && category_id != 'null') {
                sql = `SELECT * FROM matches WHERE category_id = ? ORDER BY match_time DESC`;
                params = [category_id];
            }
            const [matches] = await db.execute(sql, params);
            return res.status(200).json(matches);
        }

        // --- ➕ CREATE MATCH ---
        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots, room_id, room_pass) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?)`,
                [
                    category_id, body.title, body.entry_fee||0, body.prize_pool||0, body.per_kill||0, 
                    body.match_type, body.match_time, body.map, body.total_spots||48, 
                    body.room_id||null, body.room_pass||null
                ]
            );
            return res.status(200).json({ success: true });
        }

        // --- ✏️ EDIT MATCH (🔥 Updated Logic with Room Info) ---
        if (type === 'edit_match') {
            await db.execute(
                `UPDATE matches SET 
                title=?, entry_fee=?, prize_pool=?, per_kill=?, match_type=?, match_time=?, map=?, total_spots=?, 
                room_id=?, room_pass=? 
                WHERE id=?`, 
                [
                    body.title, 
                    body.entry_fee || 0, 
                    body.prize_pool || 0, 
                    body.per_kill || 0, 
                    body.match_type, 
                    body.match_time, 
                    body.map || '', 
                    body.total_spots || 48,
                    body.room_id || null,   // Room ID Update
                    body.room_pass || null, // Password Update
                    match_id
                ]
            );
            return res.status(200).json({ success: true, message: 'Match Updated!' });
        }

        // --- 🆕 UPDATE ROOM INFO ONLY (Alternative method if needed) ---
        if (type === 'update_room') {
            await db.execute('UPDATE matches SET room_id=?, room_pass=? WHERE id=?', [body.room_id, body.room_pass, body.id]);
            return res.status(200).json({ success: true });
        }
        
        // --- ❌ DELETE MATCH ---
        if (type === 'delete_match') {
            await db.execute('DELETE FROM match_participants WHERE match_id = ?', [id]);
            await db.execute('DELETE FROM matches WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        // --- ⚡ UPDATE STATUS ---
        if (type === 'update_match_status') { 
            await db.execute('UPDATE matches SET status = ? WHERE id = ?', [body.new_status, match_id]); 
            return res.status(200).json({ success: true }); 
        }

        // --- 📊 STATS (DASHBOARD) ---
        if (type === 'dashboard_stats') {
            try {
                const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
                const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status="pending"');
                const [w] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status="pending"');
                return res.status(200).json({ total_users: u[0].c, pending_deposits: d[0].c, pending_withdraws: w[0].c });
            } catch(e) {
                return res.status(200).json({ total_users: 0, pending_deposits: 0, pending_withdraws: 0 });
            }
        }
        
        // --- USER & WALLET (Small Actions) ---
        if (type === 'list_users') { 
            const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC'); 
            return res.status(200).json(users); 
        }

        if (type === 'kick_participant') {
             // For safety refunding, get fee
             const [match] = await db.execute('SELECT entry_fee FROM matches WHERE id = ?', [body.match_id]);
             // Find users
             const [players] = await db.execute('SELECT user_id FROM match_participants WHERE match_id=? AND (team_name=? OR game_name=?)', [body.match_id, body.team_name, body.team_name]);
             
             // Refund loop
             const refund = parseFloat(match[0]?.entry_fee || 0);
             if(refund > 0) {
                 for(let p of players) {
                     await db.execute('UPDATE users SET wallet_balance=wallet_balance+? WHERE id=?', [refund, p.user_id]);
                     await db.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Refund", "Kicked by Admin")', [p.user_id, refund]);
                 }
             }

             // Delete
             await db.execute('DELETE FROM match_participants WHERE match_id=? AND (team_name=? OR game_name=?)', [body.match_id, body.team_name, body.team_name]);
             return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown Type: ' + type });

    } catch (e) {
        console.error("API ERROR:", e);
        return res.status(500).json({ error: e.message });
    }
};
