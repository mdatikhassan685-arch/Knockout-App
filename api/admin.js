const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // বডি থেকে প্যারামিটারগুলো নিলাম
    const { 
        type, id, user_id, title, image, cat_type, 
        entry_fee, winning_prize, prize_pool, schedule_time, match_time, match_type, total_spots,
        room_id, room_pass,
        status, suspend_days, amount, action, deposit_id, withdraw_id,
        match_id, participant_id, kills, rank, prize, per_kill, map,
        youtube, telegram, whatsapp, version, announcement, notification, about, policy, category_id
    } = req.body;

    try {
        // ==========================================
        // ⚙️ SETTINGS MANAGEMENT
        // ==========================================
        if (type === 'get_settings') {
            const [rows] = await db.execute('SELECT * FROM settings');
            const settings = {};
            rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
            return res.status(200).json(settings);
        }

        if (type === 'update_settings') {
            const upsert = async (key, val) => {
                await db.execute(`INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?`, [key, val, val]);
            };
            await upsert('youtube_link', youtube);
            await upsert('telegram_link', telegram);
            await upsert('whatsapp_number', whatsapp);
            await upsert('app_version', version);
            await upsert('announcement', announcement);
            await upsert('notification_msg', notification);
            await upsert('about_us', about);
            await upsert('privacy_policy', policy);
            return res.status(200).json({ success: true, message: 'Settings Updated!' });
        }

        // =======================
        // 🔔 NOTIFICATIONS & STATS
        // =======================
        if (type === 'search_users_for_noti') {
            const { query } = req.body;
            const [users] = await db.execute(`SELECT id, username, email FROM users WHERE username LIKE ? OR id LIKE ? LIMIT 5`, [`%${query}%`, `%${query}%`]);
            return res.status(200).json(users);
        }

        if (type === 'send_notification') {
            const { title, message, target_users, send_to_all } = req.body;
            if (send_to_all) {
                await db.execute('INSERT INTO notifications (title, message, user_id) VALUES (?, ?, NULL)', [title, message]);
            } else {
                for (let uid of target_users) {
                    await db.execute('INSERT INTO notifications (title, message, user_id) VALUES (?, ?, ?)', [title, message, uid]);
                }
            }
            return res.status(200).json({ success: true, message: 'Notification Sent!' });
        }

        if (type === 'dashboard_stats') {
            const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status = "pending"');
            const [w] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status = "pending"');
            // Matches & Tournaments Count combined
            const [m] = await db.execute('SELECT COUNT(*) as c FROM matches');
            const [t] = await db.execute('SELECT COUNT(*) as c FROM tournaments');
            return res.status(200).json({ 
                total_users: u[0].c, 
                pending_deposits: d[0].c, 
                pending_withdraws: w[0].c, 
                total_tournaments: parseInt(m[0].c) + parseInt(t[0].c) 
            });
        }

        // =======================
        // 👤 USER & WALLET
        // =======================
        if (type === 'list_users') { const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC'); return res.status(200).json(users); }
        if (type === 'update_user_status') { await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, user_id]); return res.status(200).json({ success: true }); }
        if (type === 'manage_balance') {
            const finalAmount = parseFloat(amount);
            const updateSql = action === 'add' ? 'wallet_balance + ?' : 'wallet_balance - ?';
            const trxType = action === 'add' ? 'Admin Gift' : 'Penalty';
            await db.execute(`UPDATE users SET wallet_balance = ${updateSql} WHERE id = ?`, [finalAmount, user_id]);
            await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, ?, NOW())', [user_id, finalAmount, trxType]);
            return res.status(200).json({ success: true });
        }

        if (type === 'list_deposits') { const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC'); return res.status(200).json(rows); }
        if (type === 'handle_deposit') { 
            const [dep] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (action === 'approve') { 
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]); 
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [dep[0].amount, dep[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Deposit")', [dep[0].user_id, dep[0].amount]);
            } else { await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]); }
            return res.status(200).json({ success: true, message: 'Done!' });
        }

        // =======================
        // 🎮 CATEGORY (Create Game Titles)
        // =======================
        if (type === 'get_categories') { 
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC'); 
            return res.status(200).json(rows); 
        }
        if (type === 'add_category') { 
            await db.execute('INSERT INTO categories (title, image, type) VALUES (?, ?, ?)', [title, image, cat_type || 'normal']); 
            return res.status(200).json({ success: true }); 
        }
        if (type === 'delete_category') {
            await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        // =======================
        // 🔥 DAILY MATCH MANAGEMENT (NEW Logic)
        // =======================
        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming')`,
                [category_id, title, entry_fee || 0, prize_pool || 0, per_kill || 0, match_type, match_time, req.body.map]
            );
            return res.status(200).json({ success: true, message: 'Match Created!' });
        }

        // (This gets daily matches for Admin)
        if (type === 'get_admin_matches') { 
            // If category_id provided, filter by it. Else show recent.
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
            if(category_id) sql = `SELECT * FROM matches WHERE category_id = ${parseInt(category_id)} ORDER BY match_time DESC`;
            
            const [matches] = await db.execute(sql); 
            return res.status(200).json(matches); 
        }

        // =======================
        // 🏆 OFFICIAL TOURNAMENT (Manage Big Events)
        // =======================
        // Note: admin-matches.html usually handles Daily matches now.
        // But for consistency with your old code if you use 'tournaments' table:
        if (type === 'create_tournament') { // If used separately
             // Your old logic can stay if you use a separate page
             return res.status(200).json({success:true}); 
        }

        // =======================
        // 🏁 RESULT & ACTIONS
        // =======================
        if (type === 'delete_match') { 
            await db.execute('DELETE FROM match_participants WHERE match_id = ?', [id]); // Clear players first
            await db.execute('DELETE FROM matches WHERE id = ?', [id]); 
            return res.status(200).json({ success: true }); 
        }

        // Status Update
        if (type === 'update_match_status') { 
            await db.execute('UPDATE matches SET status = ? WHERE id = ?', [req.body.new_status, match_id]); 
            return res.status(200).json({ success: true }); 
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
