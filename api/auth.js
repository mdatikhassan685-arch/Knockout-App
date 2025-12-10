const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    // 1. CORS Headers (যাতে মোবাইল বা ব্রাউজার থেকে রিকোয়েস্ট ব্লক না হয়)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 2. Preflight Check (ব্রাউজার চেক করে সার্ভার ঠিক আছে কিনা)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 3. শুধু POST মেথড এক্সেপ্ট করবে
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { type, name, email, password, phone } = req.body;

    try {
        // ========== SIGNUP LOGIC ==========
        if (type === 'signup') {
            if (!name || !email || !password || !phone) {
                return res.status(400).json({ error: 'সব তথ্য পূরণ করুন' });
            }

            // ইমেইল আগে আছে কিনা চেক করা
            const [existingUser] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
            if (existingUser.length > 0) {
                return res.status(400).json({ error: 'এই ইমেইল দিয়ে আগেই একাউন্ট খোলা হয়েছে' });
            }

            // পাসওয়ার্ড এনক্রিপ্ট করা (সিকিউরিটির জন্য)
            const hashedPassword = await bcrypt.hash(password, 10);

            // ডাটাবেসে সেভ করা
            await db.execute(
                'INSERT INTO users (name, email, password, phone, balance, role) VALUES (?, ?, ?, ?, 0, "user")',
                [name, email, hashedPassword, phone]
            );

            return res.status(201).json({ message: 'একাউন্ট সফলভাবে তৈরি হয়েছে! এখন লগইন করুন।' });
        }

        // ========== LOGIN LOGIC ==========
        else if (type === 'login') {
            if (!email || !password) {
                return res.status(400).json({ error: 'ইমেইল এবং পাসওয়ার্ড দিন' });
            }

            const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

            if (users.length === 0) {
                return res.status(401).json({ error: 'ভুল ইমেইল বা পাসওয়ার্ড' });
            }

            const user = users[0];
            const isMatch = await bcrypt.compare(password, user.password);

            if (!isMatch) {
                return res.status(401).json({ error: 'ভুল ইমেইল বা পাসওয়ার্ড' });
            }

            // সফল লগইন - ইউজারের তথ্য পাঠানো
            return res.status(200).json({
                message: 'লগইন সফল!',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    balance: user.balance
                }
            });
        }

        else {
            return res.status(400).json({ error: 'ভুল রিকোয়েস্ট টাইপ' });
        }

    } catch (error) {
        console.error('Database Error:', error);
        return res.status(500).json({ error: 'সার্ভারে সমস্যা হয়েছে। একটু পরে চেষ্টা করুন।' });
    }
};
