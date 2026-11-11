const path = require('path');
const db = require(path.join(__dirname, '../script/db'));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDatabase() {
    const deadline = Date.now() + 120000;
    let lastError;
    while (Date.now() < deadline) {
        const pool = new db.sql.ConnectionPool({ ...db.config, connectionTimeout: 2000, requestTimeout: 2000 });
        try {
            await pool.connect();
            await pool.request().query('SELECT 1');
            await pool.close();
            console.log('Local database is ready.');
            return;
        } catch (error) {
            lastError = error;
            if (pool.connected) await pool.close();
            await sleep(2000);
        }
    }
    throw new Error(`Local database unavailable: ${lastError ? lastError.message : 'timeout'}`);
}

waitForDatabase().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});
