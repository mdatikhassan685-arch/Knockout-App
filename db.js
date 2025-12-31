const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 4000,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { rejectUnauthorized: true }
});

const db = pool.promise();
module.exports = db;
```
*(যদি `pool` গ্লোবাল ভেরিয়েবলে রেখে থাকেন, তবে সেটি Vercel এ কখনো কখনো সমস্যা করে। প্রতিবার `require` এ নতুন করে পুল নেওয়াই নিরাপদ)*।

---

### **২. `api/admin.js` ফাইলের শুরুতে চেক (400 Bad Request Fix):**
লগে যেহেতু `400 Bad Request` দেখাচ্ছে, এর মানে রিকোয়েস্টের বডি (body) পার্স হচ্ছে না বা `type` পাওয়া যাচ্ছে না। এই ছোট চেকটি `api/admin.js` এর শুরুতে বসান:

```javascript
    // Body Parse Logic (Vercel Fix)
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e){}
    }

    const { type, category_id, ...otherFields } = body || {};

    if (!type) {
        console.error("Missing Type in Request:", body);
        return res.status(400).json({ error: 'Invalid Request: Missing Type' });
    }
```
*এই অংশটি বডি পার্সিং এরর ঠিক করবে এবং লগ দেখাবে যদি সমস্যা থাকে।*

---

### **৩. `admin-matches.html` (Loading Fix):**
আমি লোডিং হ্যান্ডেল করার জন্য **একটি আল্টিমেট `loadMatches` ফাংশন** দিচ্ছি। এটা আগের ফাংশনটির জায়গায় বসিয়ে দিন। এটি নিশ্চিত করবে লোডিং সরে গিয়ে ডাটা দেখাবে।

```javascript
        async function loadMatches() {
            const list = document.getElementById('match_list');
            try {
                // একটি সেফ ফলব্যাক: যদি ড্রপডাউনে কিছু না থাকে, তবে নাল পাঠাবো
                const activeCatId = urlCatId || (document.getElementById('cat_id') ? document.getElementById('cat_id').value : null);

                const res = await fetch('/api/admin', { 
                    method: 'POST', 
                    headers: {'Content-Type':'application/json'}, 
                    body: JSON.stringify({ type: 'get_admin_matches', category_id: activeCatId || null }) 
                });

                if(!res.ok) throw new Error("API Fetch Error");

                const matches = await res.json();
                
                // Clear List
                list.innerHTML = "";

                if (Array.isArray(matches) && matches.length > 0) {
                    // (আপনার ম্যাপ ফাংশন যা আগের কোডে ছিল সেটি এখানে বসবে)
                    // ... map loop code here ...
                    // শর্টকাটে দেখাচ্ছি:
                    list.innerHTML = matches.map(m => `<div class='bg-gray-800 p-4 mb-2 rounded border border-gray-600'>${m.title} <span class='float-right text-gray-400'>#${m.id}</span></div>`).join('');
                } else {
                    list.innerHTML = `<div class="text-center py-10 opacity-50 border-2 border-dashed border-gray-700 rounded-xl"><p>No matches found.</p></div>`;
                }

            } catch(e) {
                console.error(e);
                list.innerHTML = `<p class="text-red-400 text-center py-10">System Error: ${e.message}</p>`;
            }
        }
