const test = require('node:test');
const assert = require('node:assert/strict');
const registerLocalUser = require('../script/registerLocalUser');

function fixture(count, insertError) {
    const state = { committed: false, rolledBack: false, inserted: null };
    class Transaction {
        async begin() {}
        async commit() { state.committed = true; }
        async rollback() { state.rolledBack = true; }
    }
    class Request {
        constructor() { this.values = {}; }
        input(name, type, value) { this.values[name] = value; return this; }
        async query(query) {
            if (query.startsWith('SELECT')) return { recordset: [{ cnt: count }] };
            if (insertError) throw insertError;
            state.inserted = this.values;
        }
    }
    return { state, db: { sql: { Transaction, Request, NVarChar: () => ({}), ISOLATION_LEVEL: { SERIALIZABLE: 4 } } } };
}

test('the first local account becomes admin, later accounts remain users', async () => {
    for (const [count, role] of [[0, 'Admin'], [1, 'User']]) {
        const { state, db } = fixture(count);
        await registerLocalUser(db, {}, { username: 'test', passwordHash: 'hash', hubId: 'hub' });
        assert.equal(state.inserted.role, role);
        assert.equal(state.inserted.hubId, 'hub');
        assert.equal(state.committed, true);
    }
});

test('failed registration rolls back and reports the original error', async () => {
    const duplicate = new Error('duplicate');
    const { state, db } = fixture(1, duplicate);
    await assert.rejects(registerLocalUser(db, {}, { username: 'test', passwordHash: 'hash', hubId: 'hub' }), duplicate);
    assert.equal(state.rolledBack, true);
    assert.equal(state.committed, false);
});
