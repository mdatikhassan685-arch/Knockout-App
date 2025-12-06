const pool = require('../../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, token } = req.body;

    if (!email || !token) {
        return res.status(400).json({ error: 'Missing credentials' });
    }

    try {
        // ১. ইমেইল এবং রোল দিয়ে অ্যাডমিন খুঁজে বের করা (টোকেন দিয়ে নয়)
        const [rows] = await pool.execute(
            'SELECT * FROM users WHERE email = ? AND role = "admin"', 
            [email]
        );

        if (rows.length > 0) {
            const admin = rows[0];
            let loginSuccess = false;
            let needsMigration = false;

            // টোকেন চেক করা (Hash নাকি Plain?)
            const isHash = admin.admin_token && (admin.admin_token.startsWith('$2a$') || admin.admin_token.startsWith('$2b$'));

            if (isHash) {
                // হ্যাশ হলে bcrypt চেক
                loginSuccess = await bcrypt.compare(token, admin.admin_token);
            } else {
                // প্লেইন টেক্সট চেক
                if (admin.admin_token === token) {
                    loginSuccess = true;
                    needsMigration = true;
                }
            }

            if (loginSuccess) {
                // টোকেন এনক্রিপ্ট করে আপডেট করা (যদি প্রয়োজন হয়)
                if (needsMigration) {
                    const salt = await bcrypt.genSalt(10);
                    const newTokenHash = await bcrypt.hash(token, salt);
                    await pool.execute('UPDATE users SET admin_token = ? WHERE id = ?', [newTokenHash, admin.id]);
                    console.log(`Admin Token migrated for user: ${admin.id}`);
                }

                return res.status(200).json({
                    success: true,
                    message: 'Admin Access Granted',
                    admin: {
                        id: admin.id,
                        username: admin.username,
                        role: 'admin'
                    }
                });
            } else {
                return res.status(401).json({ success: false, error: 'Invalid Token' });
            }
        } else {
            return res.status(404).json({ success: false, error: 'Admin not found' });
        }

    } catch (error) {
        console.error('Admin Login Error:', error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
