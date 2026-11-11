const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const networkManager = require('../script/networkManager');

function createManager() {
    const manager = new networkManager.constructor();
    manager.inventory = {};
    manager.networks = {
        test: {
            id: 'test', prefix: '192.168.10.', gateway: '192.168.10.1',
            gateway_status: {}, devices: [], lastScan: null, scanning: false
        }
    };
    manager.saveInventory = () => {};
    manager.readArp = async () => ({});
    manager.reverseLookup = async () => null;
    return manager;
}

test('scans when the gateway ignores ping and retains discovered devices', async () => {
    const manager = createManager();
    manager.ping = async () => ({ online: false, latency: null });
    manager.probeHost = async ip => ({
        ip, latency: null, online: ip === '192.168.10.12',
        openPorts: ip === '192.168.10.12' ? [6466] : []
    });
    manager.setProviders({ devices: () => [{ ip: '192.168.10.22', name: 'Living room TV' }] });

    await manager.scanNetwork('test');

    const devices = manager.networks.test.devices;
    assert.equal(manager.networks.test.gateway_status.online, false);
    assert.equal(devices.find(device => device.ip === '192.168.10.12').online, true);
    assert.deepEqual(devices.find(device => device.ip === '192.168.10.12').openPorts, [6466]);
    assert.equal(devices.find(device => device.ip === '192.168.10.22').name, 'Living room TV');
    assert.equal(devices.find(device => device.ip === '192.168.10.22').online, null);
});

test('an open service can establish reachability when ping fails', async () => {
    const manager = createManager();
    manager.config.probePorts = [6466, 8001];
    manager.ping = async () => ({ online: false, latency: null });
    manager.probePort = async (ip, port) => port === 6466 ? port : null;

    const device = await manager.probeHost('192.168.10.42');

    assert.equal(device.online, true);
    assert.deepEqual(device.openPorts, [6466]);
    assert.equal(device.latency, null);
});

test('preserves a manually configured TV when its MAC becomes available', async () => {
    const manager = createManager();
    manager.inventory['test:192.168.10.42'] = {
        ip: '192.168.10.42', network: 'test', manualTv: 'android',
        firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString()
    };
    manager.ping = async () => ({ online: true, latency: 1 });
    manager.probeHost = async ip => ({ ip, online: ip === '192.168.10.42', latency: 1, openPorts: [] });
    manager.readArp = async () => ({ '192.168.10.42': 'AA:BB:CC:DD:EE:FF' });

    await manager.scanNetwork('test');

    assert.equal(manager.networks.test.devices[0].key, 'test:192.168.10.42');
    assert.equal(manager.inventory['test:192.168.10.42'].manualTv, 'android');
    assert.equal(manager.networks.test.devices[0].mac, 'AA:BB:CC:DD:EE:FF');
});

test('probes real TCP services without requiring ICMP', async t => {
    const server = net.createServer(socket => socket.end());
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const manager = createManager();
    manager.config.probePorts = [server.address().port];
    manager.ping = async () => ({ online: false, latency: null });

    const device = await manager.probeHost('127.0.0.1');

    assert.equal(device.online, true);
    assert.deepEqual(device.openPorts, [server.address().port]);
});

test('reads Linux neighbor entries containing digits in interface names', () => {
    const manager = createManager();
    assert.deepEqual(manager.parseNeighbors('192.168.10.42 dev enp2s0 lladdr aa:bb:cc:dd:ee:ff REACHABLE\n'), {
        '192.168.10.42': 'AA:BB:CC:DD:EE:FF'
    });
});
