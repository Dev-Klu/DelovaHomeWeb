const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const Module = require('node:module');

const disk = { files: {}, failRename: false };
const fakeFs = {
    existsSync: file => Object.hasOwn(disk.files, file),
    writeFileSync: (file, contents) => { disk.files[file] = contents; },
    renameSync: (from, to) => {
        if (disk.failRename) throw new Error('disk unavailable');
        disk.files[to] = disk.files[from];
        delete disk.files[from];
    },
    unlinkSync: file => { delete disk.files[file]; }
};
const cron = {
    validate: expression => expression === '0 8 * * *',
    schedule: () => ({ stop() {} })
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (parent && parent.filename.endsWith('automationManager.js')) {
        if (request === 'fs') return fakeFs;
        if (request === 'node-cron') return cron;
        if (request === './deviceManager' || request === './presenceManager') return new EventEmitter();
        if (request === './notificationManager') return {};
    }
    return originalLoad.apply(this, arguments);
};
let AutomationManager;
try {
    AutomationManager = require('../script/automationManager').constructor;
} finally {
    Module._load = originalLoad;
}

function automation() {
    return { id: 'one', name: 'Test', enabled: false, trigger: { type: 'time', cron: '0 8 * * *' }, actions: [] };
}

test('preserves disabled status across creation and edits', () => {
    const manager = new AutomationManager();
    manager.addAutomation(automation());
    manager.updateAutomation('one', { name: 'Updated' });
    assert.equal(manager.getAutomations()[0].enabled, false);
    assert.equal(manager.tasks.size, 0);
    assert.equal(JSON.parse(Object.values(disk.files)[0])[0].enabled, false);
});

test('rejects invalid schedules without changing the existing automation', () => {
    const manager = new AutomationManager();
    manager.addAutomation(automation());
    assert.throws(() => manager.updateAutomation('one', { trigger: { type: 'time', cron: 'bad' } }), /cron/i);
    assert.equal(manager.getAutomations()[0].trigger.cron, '0 8 * * *');
});

test('a failed save leaves the existing rule and its schedule intact', () => {
    const manager = new AutomationManager();
    manager.addAutomation({ ...automation(), enabled: true });
    disk.failRename = true;
    try {
        assert.throws(() => manager.updateAutomation('one', { enabled: false }), /disk unavailable/);
        assert.equal(manager.getAutomations()[0].enabled, true);
        assert.equal(manager.tasks.size, 1);
        assert.throws(() => manager.deleteAutomation('one'), /disk unavailable/);
        assert.equal(manager.getAutomations().length, 1);
    } finally {
        disk.failRename = false;
    }
});
