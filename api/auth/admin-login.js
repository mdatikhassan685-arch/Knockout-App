const pool = require('../../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    const { email, token } = req.body;

    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? AND role = "admin"', [email]);

        if (rows.length > 0) {
            const admin = rows[0];
            const dbToken = admin.admin_token;
            
            // ১. যদি টোকেন এনক্রিপ্ট করা থাকে
            if (dbToken && dbToken.startsWith('$2a$')) {
                const isMatch = await bcrypt.compare(token, dbToken);
                if (isMatch) {
                    return res.status(200).json({ success: true, admin: { id: admin.id, role: 'admin' } });
                }
            } 
            
            // ২. যদি প্লেইন টেক্সট হয় (সরাসরি স্ট্রিং তুলনা)
            if (dbToken === token) {
                // সাথে সাথে এনক্রিপ্ট করা হচ্ছে
                console.log("Migrating Admin Token...");
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(token, salt);
                
                await pool.execute('UPDATE users SET admin_token = ? WHERE id = ?', [hash, admin.id]);
                
                return res.status(200).json({ success: true, admin: { id: admin.id, role: 'admin' } });
            }

            return res.status(401).json({ success: false, error: 'Invalid Token' });
        }
        return res.status(404).json({ success: false, error: 'Admin not found' });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
