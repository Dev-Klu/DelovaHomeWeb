const test = require('node:test');
const assert = require('node:assert/strict');
const isPrivateStaticPath = require('../script/staticPrivacy');

test('protects stored device credentials and private keys but allows locale assets', () => {
    for (const path of ['/data/network_devices.json', '/data/hue_config.json', '/nas-config.json',
        '/samsung-tokens.json', '/server.key', '/androidtv-key.pem', '/script/db.js']) {
        assert.equal(isPrivateStaticPath(path), true, path);
    }
    for (const path of ['/data/locales.json', '/pages/devices.html', '/script/devices.js']) {
        assert.equal(isPrivateStaticPath(path), false, path);
    }
});

test('normalizes alternate separators and paths before checking', () => {
    assert.equal(isPrivateStaticPath('/script/../server.key'), true);
    assert.equal(isPrivateStaticPath('\\data\\network.json'), true);
});
