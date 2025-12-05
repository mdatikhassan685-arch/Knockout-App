const mysql = require('mysql2/promise');

// Vercel-এ গ্লোবাল কানেকশন ক্যাশ করা
let pool;

if (!global.dbPool) {
    global.dbPool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: 4000, // TiDB Port
        ssl: {
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true
        },
        waitForConnections: true,
        connectionLimit: 1, // সার্ভারলেসের জন্য কম রাখাই ভালো
        queueLimit: 0
    });
}

pool = global.dbPool;

module.exports = pool;
