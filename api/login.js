const pool = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }

    try {
        // ইউজার খোঁজা
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            const user = rows[0];
            let loginSuccess = false;
            let needsMigration = false;

            // ১. প্রথমে চেক করি এটি কি হ্যাশ করা পাসওয়ার্ড?
            const isHash = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');

            if (isHash) {
                // হ্যাশ হলে bcrypt দিয়ে চেক
                loginSuccess = await bcrypt.compare(password, user.password);
            } else {
                // হ্যাশ না হলে প্লেইন টেক্সট চেক (পুরনো ইউজার)
                if (user.password === password) {
                    loginSuccess = true;
                    needsMigration = true; // একে মাইগ্রেট করতে হবে
                }
            }

            if (loginSuccess) {
                // ২. যদি পুরনো পাসওয়ার্ড হয়, তবে এখনই এনক্রিপ্ট করে আপডেট করি
                if (needsMigration) {
                    const salt = await bcrypt.genSalt(10);
                    const newHash = await bcrypt.hash(password, salt);
                    await pool.execute('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]);
                    console.log(`Password migrated for user: ${user.id}`);
                }

                // ৩. লগইন সফল
                return res.status(200).json({
                    success: true,
                    message: 'Login successful',
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        balance: user.wallet_balance
                    }
                });
            } else {
                return res.status(401).json({ success: false, message: 'Wrong password' });
            }
        } else {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
