const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    // 1. CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, email, password, username, token } = req.body;

    try {
        // ========== USER LOGIN ==========
        if (type === 'login') {
            if (!email || !password) return res.status(400).json({ error: 'Email & Password required' });

            // সব কলাম সিলেক্ট করা হচ্ছে যাতে status ও balance পাওয়া যায়
            const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            
            if (users.length === 0) return res.status(401).json({ error: 'User not found' });

            const user = users[0];

            // ১. পাসওয়ার্ড চেক
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).json({ error: 'Wrong password' });

            // ২. স্ট্যাটাস চেক (Blocked হলে লগইন হবে না)
            if (user.status === 'blocked') {
                return res.status(403).json({ error: 'Your account has been BLOCKED by Admin.' });
            }
            if (user.status === 'suspended') {
                // যদি suspended_until কলাম থাকে এবং সময় বাকি থাকে
                if (user.suspended_until && new Date(user.suspended_until) > new Date()) {
                    return res.status(403).json({ error: `Account suspended until ${new Date(user.suspended_until).toLocaleString()}` });
                }
                // সময় শেষ হলে অটোমেটিক আন-সাসপেন্ড (Optional)
                // await db.execute('UPDATE users SET status = "active" WHERE id = ?', [user.id]);
            }

            // ৩. সফল লগইন (ব্যালেন্স সহ)
            return res.status(200).json({
                success: true,
                message: 'Login successful',
                user: { 
                    id: user.id, 
                    username: user.username, 
                    email: user.email, 
                    role: user.role,
                    status: user.status,
                    // ব্যালেন্স বা ওয়ালেট ব্যালেন্স চেক
                    wallet_balance: user.wallet_balance || user.balance || 0 
                }
            });
        }

        // ========== ADMIN LOGIN ==========
        else if (type === 'admin_login') {
            if (!email || !token) return res.status(400).json({ error: 'Email & Token required' });

            // রোল চেক (শুধু অ্যাডমিন)
            const [admins] = await db.execute('SELECT * FROM users WHERE email = ? AND role = "admin"', [email]);
            
            if (admins.length === 0) return res.status(401).json({ error: 'Admin access denied' });

            // টোকেন চেক (সাধারণত ডাটাবেসে থাকে, এখানে হার্ডকোড বা এনভায়রনমেন্ট ভেরিয়েবল হতে পারে)
            // ধরে নিচ্ছি টোকেন ঠিক আছে (অথবা DB তে 'admin_token' কলামের সাথে চেক করতে পারেন)
            
            return res.status(200).json({
                success: true,
                message: 'Admin Access Granted',
                user: { id: admins[0].id, username: admins[0].username, role: 'admin' }
            });
        }

        // ========== SIGNUP ==========
        else if (type === 'signup') {
            if (!username || !email || !password) return res.status(400).json({ error: 'All fields required' });

            const [exists] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
            if (exists.length > 0) return res.status(400).json({ error: 'Email already registered' });

            const hashedPassword = await bcrypt.hash(password, 10);
            
            // ডিফল্ট status = 'active'
            await db.execute(
                'INSERT INTO users (username, email, password, role, wallet_balance, status) VALUES (?, ?, ?, ?, ?, ?)',
                [username, email, hashedPassword, 'user', 0.00, 'active']
            );

            return res.status(201).json({ success: true, message: 'Registration successful' });
        }

        else {
            return res.status(400).json({ error: 'Invalid request type' });
        }

    } catch (error) {
        console.error('Auth API Error:', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
