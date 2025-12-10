const db = require('../db');

module.exports = async (req, res) => {
    // 1. Headers Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, ...data } = req.body;

    try {
        // ========== 1. DASHBOARD STATS (Total Users, Balance) ==========
        if (type === 'get_stats') {
            const [users] = await db.execute('SELECT COUNT(*) as total FROM users');
            const [deposits] = await db.execute('SELECT COUNT(*) as pending FROM deposits WHERE status="pending"');
            const [balance] = await db.execute('SELECT SUM(balance) as total_money FROM users');
            
            return res.status(200).json({
                total_users: users[0].total,
                pending_deposits: deposits[0].pending,
                user_balance: balance[0].total_money || 0
            });
        }

        // ========== 2. MANAGE GAME CATEGORIES ==========
        else if (type === 'add_category') {
            const { title, image } = data;
            await db.execute(
                'INSERT INTO categories (title, image_url, status) VALUES (?, ?, "active")',
                [title, image]
            );
            return res.status(200).json({ message: 'Game Added Successfully!' });
        }

        // ========== 3. MANAGE ANNOUNCEMENT ==========
        else if (type === 'update_notice') {
            const { message } = data;
            // সব আগের নোটিশ inactive করে দেওয়া
            await db.execute('UPDATE announcements SET status="inactive"');
            // নতুন নোটিশ যোগ করা
            await db.execute('INSERT INTO announcements (message, status) VALUES (?, "active")', [message]);
            
            return res.status(200).json({ message: 'Notice Updated!' });
        }

        // ========== 4. MANAGE DEPOSITS ==========
        else if (type === 'get_deposits') {
            const [rows] = await db.execute('SELECT * FROM deposits WHERE status="pending" ORDER BY id DESC');
            return res.status(200).json({ deposits: rows });
        }

        else if (type === 'approve_deposit') {
            const { depositId, userId, amount } = data;
            
            // ১. ডিপোজিট স্ট্যাটাস আপডেট
            await db.execute('UPDATE deposits SET status="approved" WHERE id=?', [depositId]);
            
            // ২. ইউজারের ব্যালেন্স বাড়ানো
            await db.execute('UPDATE users SET balance = balance + ? WHERE id=?', [amount, userId]);
            
            // ৩. ট্রানজেকশন হিস্ট্রি আপডেট
            await db.execute('UPDATE transactions SET description="Deposit Approved" WHERE user_id=? AND amount=? AND type="deposit_req" ORDER BY id DESC LIMIT 1', [userId, amount]);

            return res.status(200).json({ message: 'Deposit Approved!' });
        }

        else {
            return res.status(400).json({ error: 'Invalid Admin Action' });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
