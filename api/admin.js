// Version: 2.1 (Force Update & Safe Mode)
const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, status, deposit_id, withdraw_id, action } = req.body;

    try {
        // ========== DASHBOARD STATS (SAFE MODE) ==========
        if (type === 'dashboard_stats') {
            let totalUsers = 0;
            let pendingDeposits = 0;
            let pendingWithdraws = 0;
            let totalTournaments = 0;

            try {
                const [u] = await db.execute('SELECT COUNT(*) as total FROM users');
                totalUsers = u[0].total;
            } catch (e) {}

            try {
                const [d] = await db.execute('SELECT COUNT(*) as pending FROM deposits WHERE status = "pending"');
                pendingDeposits = d[0].pending;
            } catch (e) {}

            try {
                const [w] = await db.execute('SELECT COUNT(*) as pending FROM withdrawals WHERE status = "pending"');
                pendingWithdraws = w[0].pending;
            } catch (e) {}

            try {
                const [t] = await db.execute('SELECT COUNT(*) as total FROM tournaments');
                totalTournaments = t[0].total;
            } catch (e) {}
            
            return res.status(200).json({
                total_users: totalUsers,
                pending_deposits: pendingDeposits,
                pending_withdraws: pendingWithdraws,
                total_tournaments: totalTournaments
            });
        }

        // ========== USER LIST (SUPER SAFE MODE) ==========
        if (type === 'list_users') {
            // সব কলাম সিলেক্ট করা হচ্ছে যাতে কলাম নেম এরর না হয়
            const [users] = await db.execute('SELECT * FROM users ORDER BY id DESC LIMIT 50');
            
            const formattedUsers = users.map(u => ({
                id: u.id,
                username: u.username || u.name || "Unknown",
                email: u.email,
                wallet_balance: u.wallet_balance || u.balance || 0,
                status: u.status || 'active'
            }));

            return res.status(200).json(formattedUsers);
        }

        // ========== PENDING DEPOSITS LIST (SAFE) ==========
        if (type === 'list_deposits') {
            const [deposits] = await db.execute(
                `SELECT d.*, COALESCE(u.username, u.name, 'Unknown User') as username 
                FROM deposits d 
                LEFT JOIN users u ON d.user_id = u.id 
                ORDER BY d.created_at DESC LIMIT 50`
            );
            // জাভাস্ক্রিপ্ট দিয়ে ফিল্টার করা হচ্ছে
            const pending = deposits.filter(d => d.status && d.status.toLowerCase() === 'pending');
            return res.status(200).json(pending);
        }

        // ========== HANDLE DEPOSIT (Approve/Reject) ==========
        if (type === 'handle_deposit') {
            if (!deposit_id || !action) return res.status(400).json({ error: 'Invalid parameters' });

            const [deposit] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (deposit.length === 0) return res.status(404).json({ error: 'Request not found' });

            const { user_id, amount: depAmount } = deposit[0];

            if (action === 'approve') {
                try {
                    await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [depAmount, user_id]);
                } catch {
                    await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [depAmount, user_id]);
                }
                
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Deposit")', [user_id, depAmount]);
                return res.status(200).json({ success: true, message: 'Deposit Approved' });
            } else {
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
                return res.status(200).json({ success: true, message: 'Deposit Rejected' });
            }
        }

        // ========== PENDING WITHDRAWALS LIST (SAFE) ==========
        if (type === 'list_withdrawals') {
            const [data] = await db.execute(
                `SELECT w.*, COALESCE(u.username, u.name, 'Unknown User') as username 
                FROM withdrawals w 
                LEFT JOIN users u ON w.user_id = u.id 
                ORDER BY w.created_at DESC LIMIT 50`
            );
            const pending = data.filter(d => d.status && d.status.toLowerCase() === 'pending');
            return res.status(200).json(pending);
        }

        // ========== HANDLE WITHDRAWAL ==========
        if (type === 'handle_withdrawal') {
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ?', [withdraw_id]);
            if (!wd.length) return res.status(404).json({ error: 'Not found' });
            
            const { user_id, amount: wdAmount } = wd[0];

            if (action === 'approve') {
                try {
                    await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [wdAmount, user_id]);
                } catch {
                    await db.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [wdAmount, user_id]);
                }
                await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Withdraw")', [user_id, -wdAmount]);
                return res.status(200).json({ success: true, message: 'Withdrawal Approved' });
            } else {
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]);
                return res.status(200).json({ success: true, message: 'Withdrawal Rejected' });
            }
        }

        // ========== UPDATE USER STATUS ==========
        if (type === 'update_user_status') {
            let suspendUntil = null;
            
            // সাসপেন্ডের তারিখ হিসাব করা
            if (status === 'suspended' && req.body.suspend_days) {
                const days = parseInt(req.body.suspend_days);
                const date = new Date();
                date.setDate(date.getDate() + days);
                suspendUntil = date.toISOString().slice(0, 19).replace('T', ' ');
            }

            try {
                // suspended_until কলামটি আপডেট করা হবে
                await db.execute(
                    'UPDATE users SET status = ?, suspended_until = ? WHERE id = ?', 
                    [status, suspendUntil, user_id]
                );
                return res.status(200).json({ success: true, message: 'Status updated' });
            } catch (err) {
                // যদি suspended_until কলাম না থাকে, শুধু স্ট্যাটাস আপডেট হবে
                await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, user_id]);
                return res.status(200).json({ success: true, message: 'Status updated (Duration ignored)' });
            }
        }

        // ========== ADMIN ADD MONEY (নতুন ফিচার) ==========
        if (type === 'admin_add_money') {
            await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, user_id]);
            await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Admin Gift")', [user_id, amount]);
            return res.status(200).json({ success: true });
        }

        // ========== CREATE CATEGORY ==========
        if (type === 'create_category') {
            const { title, image } = req.body;
            await db.execute(
                'INSERT INTO tournaments (title, image, is_category, is_official) VALUES (?, ?, 1, 0)',
                [title, image]
            );
            return res.status(200).json({ success: true, message: 'Category created' });
        }

        // ========== LIST CATEGORIES ==========
        if (type === 'list_categories') {
            const [cats] = await db.execute('SELECT * FROM tournaments WHERE is_category = 1');
            return res.status(200).json(cats);
        }

        else {
            return res.status(400).json({ error: 'Invalid type' });
        }

    } catch (error) {
        console.error('Admin API Error:', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
