const db = require('../db');

module.exports = async (req, res) => {
    // CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, status, suspend_days, amount, action, deposit_id, withdraw_id } = req.body;

    try {
        // ... (Dashboard Stats, List Users কোড আগের মতোই থাকবে) ...
        if (type === 'dashboard_stats') {
             // আগের কোড ব্যবহার করুন বা সংক্ষেপে:
             const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
             const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status="pending"');
             const [w] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status="pending"');
             return res.status(200).json({ total_users: u[0].c, pending_deposits: d[0].c, pending_withdraws: w[0].c, total_tournaments: 0 });
        }
        
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

        // =======================
        // 💰 BALANCE MANAGE
        // =======================
        if (type === 'manage_balance') {
            const finalAmount = parseFloat(amount);
            if (isNaN(finalAmount)) return res.status(400).json({ error: 'Invalid amount' });

            if (action === 'add') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [finalAmount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Admin Gift", NOW())', [user_id, finalAmount]);
            } 
            else if (action === 'deduct') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [finalAmount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Penalty", NOW())', [user_id, finalAmount]);
            }
            return res.status(200).json({ success: true, message: 'Balance Updated' });
        }

        // =======================
        // 📥 DEPOSIT HANDLE
        // =======================
        if (type === 'list_deposits') {
            const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_deposit') {
            const [dep] = await db.execute('SELECT * FROM deposits WHERE id = ? AND status = "pending"', [deposit_id]);
            if (dep.length === 0) return res.status(400).json({ error: 'Already processed' });
            
            const deposit = dep[0];
            const amount = parseFloat(deposit.amount);

            if (action === 'approve') {
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, deposit.user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Deposit", NOW())', [deposit.user_id, amount]);
                return res.status(200).json({ success: true, message: 'Approved' });
            } else {
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
                return res.status(200).json({ success: true, message: 'Rejected' });
            }
        }

        // =======================
        // 📤 WITHDRAW HANDLE (FIXED REFUND LOGIC)
        // =======================
        if (type === 'list_withdrawals') {
            const [rows] = await db.execute('SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = "pending" ORDER BY w.created_at DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_withdrawal') {
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ? AND status = "pending"', [withdraw_id]);
            if (wd.length === 0) return res.status(400).json({ error: 'Request not found' });
            
            const withdraw = wd[0];
            const amount = parseFloat(withdraw.amount);

            if (action === 'approve') {
                // টাকা আগেই কেটে রাখা হয়েছে, তাই শুধু স্ট্যাটাস আপডেট আর ট্রানজেকশন লগ আপডেট
                await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]);
                // অপশনাল: ট্রানজেকশন টেবিল আপডেট করা যেতে পারে "Withdraw Success" হিসেবে
                return res.status(200).json({ success: true, message: 'Withdrawal Approved' });
            } 
            else if (action === 'reject') {
                // ⚠️ রিজেক্ট করলে টাকা ফেরত দিতে হবে
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]);
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, withdraw.user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Refund (Withdraw Rejected)", NOW())', [withdraw.user_id, amount]);
                
                return res.status(200).json({ success: true, message: 'Rejected & Money Refunded' });
            }
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
```

---

### ✅ ফিক্সড ফাইল ৩: `db.js` (মাইনর ফিক্স)
`process.env.DB_PORT` অনেক সময় স্ট্রিং হিসেবে আসে, তাই সেটাকে ইন্টিজারে কনভার্ট করা নিরাপদ।

```javascript
const mysql = require('mysql2');
require('dotenv').config();

let pool;

if (!pool) {
    pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: parseInt(process.env.DB_PORT || 4000), // Parse Int added
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true
        }
    });
}

const db = pool.promise();
module.exports = db;
