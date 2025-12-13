const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ইনপুট ভেরিয়েবল
    const { 
        type, id, user_id, title, image, cat_type, 
        entry_fee, winning_prize, schedule_time, match_type, total_spots,
        room_id, room_pass,
        status, suspend_days, amount, action, deposit_id, withdraw_id,
        match_id, participant_id, kills, rank, prize
    } = req.body;

    try {
        // ==========================================
        // DASHBOARD STATS
        // ==========================================
        if (type === 'dashboard_stats') {
            const [users] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [deposits] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status = "pending"');
            const [withdraws] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status = "pending"');
            
            let tourneys = 0;
            try {
                const [t] = await db.execute('SELECT COUNT(*) as c FROM tournaments');
                tourneys = t[0].c;
            } catch(e) {}

            return res.status(200).json({
                total_users: users[0].c,
                pending_deposits: deposits[0].c,
                pending_withdraws: withdraws[0].c,
                total_tournaments: tourneys
            });
        }

        // ==========================================
        // USER MANAGEMENT
        // ==========================================
        if (type === 'list_users') {
            const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC');
            return res.status(200).json(users);
        }

        if (type === 'update_user_status') {
            let sql = 'UPDATE users SET status = ? WHERE id = ?';
            let params = [status, user_id];
            if (status === 'suspended' && suspend_days) {
                sql = 'UPDATE users SET status = ?, suspended_until = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?';
                params = [status, suspend_days, user_id];
            }
            await db.execute(sql, params);
            return res.status(200).json({ success: true, message: 'Status Updated' });
        }

        if (type === 'manage_balance') {
            const finalAmount = parseFloat(amount);
            if (action === 'add') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [finalAmount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Admin Gift", NOW())', [user_id, finalAmount]);
            } else {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [finalAmount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Penalty", NOW())', [user_id, finalAmount]);
            }
            return res.status(200).json({ success: true, message: 'Balance Updated' });
        }

        // ==========================================
        // DEPOSIT & WITHDRAW
        // ==========================================
        if (type === 'list_deposits') {
            const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_deposit') {
            const [dep] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (dep.length === 0) return res.status(400).json({ error: 'Not found' });
            
            if (action === 'approve') {
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(dep[0].amount), dep[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Deposit", NOW())', [dep[0].user_id, parseFloat(dep[0].amount)]);
            } else {
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
            }
            return res.status(200).json({ success: true, message: 'Processed' });
        }

        if (type === 'list_withdrawals') {
            const [rows] = await db.execute('SELECT w.*, u.username, u.wallet_balance FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = "pending" ORDER BY w.created_at DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_withdrawal') {
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ?', [withdraw_id]);
            if (wd.length === 0) return res.status(400).json({ error: 'Not found' });

            if (action === 'approve') {
                await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]);
            } else {
                // Refund Money
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]);
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(wd[0].amount), wd[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Refund", NOW())', [wd[0].user_id, parseFloat(wd[0].amount)]);
            }
            return res.status(200).json({ success: true, message: 'Processed' });
        }

        // ==========================================
        // CATEGORY MANAGEMENT
        // ==========================================
        if (type === 'get_categories') {
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
            return res.status(200).json(rows);
        }

        if (type === 'add_category') {
            const finalType = cat_type || 'normal';
            await db.execute('INSERT INTO categories (title, image, type) VALUES (?, ?, ?)', [title, image, finalType]);
            return res.status(200).json({ success: true });
        }

        if (type === 'edit_category') {
            await db.execute('UPDATE categories SET title = ?, image = ?, type = ? WHERE id = ?', [title, image, cat_type, id]);
            return res.status(200).json({ success: true });
        }

        if (type === 'delete_category') {
            await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        // ==========================================
        // TOURNAMENT MANAGEMENT
        // ==========================================
        if (type === 'get_admin_matches') {
            const { category_id } = req.body;
            const [matches] = await db.execute('SELECT * FROM tournaments WHERE category_id = ? ORDER BY schedule_time DESC', [category_id]);
            return res.status(200).json(matches);
        }

        if (type === 'add_match') {
            const { category_id, title, entry_fee, winning_prize, schedule_time, match_type, total_spots } = req.body;
            await db.execute(`
                INSERT INTO tournaments 
                (category_id, title, entry_fee, winning_prize, schedule_time, match_type, total_spots, status, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, "upcoming", NOW())
            `, [category_id, title, entry_fee, winning_prize, schedule_time, match_type, total_spots]);
            return res.status(200).json({ success: true });
        }

        if (type === 'delete_match') {
            await db.execute('DELETE FROM tournaments WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        if (type === 'update_room') {
            await db.execute('UPDATE tournaments SET room_id = ?, room_pass = ? WHERE id = ?', [room_id, room_pass, id]);
            return res.status(200).json({ success: true });
        }

        if (type === 'update_match_status') {
            const { match_id, new_status } = req.body;
            await db.execute('UPDATE tournaments SET status = ? WHERE id = ?', [new_status, match_id]);
            return res.status(200).json({ success: true });
        }

        // ==========================================
        // 🏆 RESULT MANAGEMENT (FIXED SQL)
        // ==========================================
        if (type === 'get_match_participants') {
            const [players] = await db.execute(`
                SELECT p.*, u.username 
                FROM participants p 
                JOIN users u ON p.user_id = u.id 
                WHERE p.tournament_id = ?
            `, [match_id]);
            return res.status(200).json(players);
        }

        if (type === 'save_result') {
            // ✅ FIX: 'rank' এর দুই পাশে ব্যাকটিক (`) ব্যবহার করা হয়েছে
            await db.execute(
                'UPDATE participants SET kills = ?, `rank` = ?, prize_won = ? WHERE id = ?',
                [kills, rank, prize, participant_id]
            );

            if (parseFloat(prize) > 0) {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [prize, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Match Winnings", NOW())', [user_id, prize]);
            }
            return res.status(200).json({ success: true });
        }

        if (type === 'finish_match') {
            await db.execute('UPDATE tournaments SET status = "completed" WHERE id = ?', [match_id]);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
