const db = require('../db');

module.exports = async (req, res) => {
    // CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, amount, method, account_number, sender_number, trx_id } = req.body;

    try {
        // =======================
        // 🏠 HOME DATA (ক্যাটাগরি ফিক্স)
        // =======================
        if (type === 'home') {
            const [userData] = await db.execute('SELECT wallet_balance, status FROM users WHERE id = ?', [user_id]);
            
            if (userData.length === 0) return res.status(404).json({ error: 'User not found' });

            // ১. ব্যানার আনা
            let banners = [];
            try {
                const [b] = await db.execute('SELECT * FROM banners ORDER BY id DESC');
                banners = b;
            } catch(e) {}

            // ২. ✅ ক্যাটাগরি আনা (এই লাইনটি জরুরি)
            let categories = [];
            try {
                const [c] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
                categories = c;
            } catch(e) {
                console.error("Category Fetch Error:", e);
            }

            // ৩. এনাউন্সমেন্ট আনা
            let announcementText = "Welcome to Knockout Esports!";
            try {
                const [notices] = await db.execute('SELECT message FROM announcements ORDER BY id DESC LIMIT 1');
                if (notices.length > 0) announcementText = notices[0].message;
            } catch (err) {}

            return res.status(200).json({
                wallet: parseFloat(userData[0].wallet_balance),
                status: userData[0].status,
                announcement: announcementText,
                banners: banners,
                categories: categories // ✅ ডাটাবেসের ক্যাটাগরি পাঠানো হচ্ছে
            });
        }

        // =======================
        // 💰 WALLET INFO
        // =======================
        if (type === 'wallet_info') {
            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const [transactions] = await db.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [user_id]);
            
            return res.status(200).json({
                balance: parseFloat(user[0]?.wallet_balance || 0),
                transactions: transactions
            });
        }

        // =======================
        // 📥 DEPOSIT REQUEST
        // =======================
        if (type === 'deposit') {
            const depositAmount = parseFloat(amount);
            if (!depositAmount || depositAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });
            if (!sender_number || !trx_id) return res.status(400).json({ error: 'All fields required' });
            
            await db.execute(
                'INSERT INTO deposits (user_id, amount, sender_number, trx_id, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())',
                [user_id, depositAmount, sender_number, trx_id]
            );

            return res.status(200).json({ success: true, message: 'Deposit request submitted!' });
        }

        // =======================
        // 📤 WITHDRAW REQUEST
        // =======================
        if (type === 'withdraw') {
            const withdrawAmount = parseFloat(amount);
            if (!withdrawAmount || withdrawAmount < 50) return res.status(400).json({ error: 'Minimum withdraw 50 Tk' });
            if (!account_number || !method) return res.status(400).json({ error: 'Fill all fields' });

            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const currentBalance = parseFloat(user[0].wallet_balance);

            if (currentBalance < withdrawAmount) {
                return res.status(400).json({ error: 'Insufficient balance!' });
            }

            await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [withdrawAmount, user_id]);

            await db.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())',
                [user_id, withdrawAmount, method, account_number]
            );

            await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Withdraw Request", NOW())', [user_id, withdrawAmount]);

            return res.status(200).json({ success: true, message: 'Withdraw request sent! Amount deducted.' });
        }

        return res.status(400).json({ error: 'Invalid Request' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
