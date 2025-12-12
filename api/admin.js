const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, status, suspend_days, amount, action, deposit_id, withdraw_id } = req.body;

    try {
        // ==========================================
        // 📊 DASHBOARD STATS
        // ==========================================
        if (type === 'dashboard_stats') {
            const [users] = await db.execute('SELECT COUNT(*) as count FROM users');
            const [deposits] = await db.execute('SELECT COUNT(*) as count FROM deposits WHERE status = "pending"');
            const [withdraws] = await db.execute('SELECT COUNT(*) as count FROM withdrawals WHERE status = "pending"');
            
            let tourneys = 0;
            try {
                // যদি tournaments টেবিল থাকে
                const [t] = await db.execute('SELECT COUNT(*) as count FROM tournaments');
                tourneys = t[0].count;
            } catch(e) {}

            return res.status(200).json({
                total_users: users[0].count,
                pending_deposits: deposits[0].count,
                pending_withdraws: withdraws[0].count,
                total_tournaments: tourneys
            });
        }

        // ==========================================
        // 👥 USER MANAGEMENT
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
            return res.status(200).json({ success: true, message: `User status updated to ${status}` });
        }

        // ==========================================
        // 💰 MANUAL BALANCE MANAGER
        // ==========================================
        if (type === 'manage_balance') {
            const finalAmount = parseFloat(amount);
            if (isNaN(finalAmount)) return res.status(400).json({ error: 'Invalid amount' });

            if (action === 'add') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [finalAmount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Admin Gift", NOW())', [user_id, finalAmount]);
            } 
            else if (action === 'deduct') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [finalAmount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Penalty/Cut", NOW())', [user_id, finalAmount]);
            }

            return res.status(200).json({ success: true, message: 'Balance updated successfully' });
        }

        // ==========================================
        // 📥 DEPOSIT MANAGEMENT
        // ==========================================
        if (type === 'list_deposits') {
            const [rows] = await db.execute(`
                SELECT d.*, u.username 
                FROM deposits d 
                JOIN users u ON d.user_id = u.id 
                WHERE d.status = 'pending' 
                ORDER BY d.created_at DESC
            `);
            return res.status(200).json(rows);
        }

        if (type === 'handle_deposit') {
            const [dep] = await db.execute('SELECT * FROM deposits WHERE id = ? AND status = "pending"', [deposit_id]);
            if (dep.length === 0) return res.status(400).json({ error: 'Deposit not found or already processed' });

            const deposit = dep[0];
            const depAmount = parseFloat(deposit.amount);

            if (action === 'approve') {
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [depAmount, deposit.user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Deposit", NOW())', [deposit.user_id, depAmount]);
                
                return res.status(200).json({ success: true, message: 'Deposit Approved & Balance Added' });
            } 
            else if (action === 'reject') {
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
                return res.status(200).json({ success: true, message: 'Deposit Rejected' });
            }
        }

        // ==========================================
        // 📤 WITHDRAW MANAGEMENT
        // ==========================================
        if (type === 'list_withdrawals') {
            const [rows] = await db.execute(`
                SELECT w.*, u.username, u.wallet_balance 
                FROM withdrawals w 
                JOIN users u ON w.user_id = u.id 
                WHERE w.status = 'pending' 
                ORDER BY w.created_at DESC
            `);
            return res.status(200).json(rows);
        }

        if (type === 'handle_withdrawal') {
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ? AND status = "pending"', [withdraw_id]);
            if (wd.length === 0) return res.status(400).json({ error: 'Request not found' });

            const withdraw = wd[0];
            const wdAmount = parseFloat(withdraw.amount);

            if (action === 'approve') {
                // টাকা আগেই কেটে রাখা হয়েছে, তাই শুধু স্ট্যাটাস আপডেট
                await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]);
                return res.status(200).json({ success: true, message: 'Withdraw Approved' });
            } 
            else if (action === 'reject') {
                // রিজেক্ট হলে টাকা ফেরত দিতে হবে
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]);
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [wdAmount, withdraw.user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Refund (Withdraw Rejected)", NOW())', [withdraw.user_id, wdAmount]);

                return res.status(200).json({ success: true, message: 'Withdraw Rejected & Money Refunded' });
            }
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error('Admin API Error:', error);
        return res.status(500).json({ error: 'Server Error', details: error.message });
    }
};
