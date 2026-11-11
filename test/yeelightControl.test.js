const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { isYeelight, sendYeelightCommand, getYeelightState } = require('../script/yeelightControl');

async function createLamp(t, respond) {
    const server = net.createServer(socket => {
        socket.on('data', data => respond(socket, JSON.parse(data.toString())));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    return server.address().port;
}

test('waits for the Yeelight acknowledgement, including fragmented responses', async t => {
    let request;
    const port = await createLamp(t, (socket, message) => {
        request = message;
        socket.write('{"method":"props","params":{}}\r\n{"id":1,');
        setTimeout(() => socket.write('"result":["ok"]}\r\n'), 10);
    });
    await sendYeelightCommand('127.0.0.1', 'set_brightness', '45', { port });
    assert.deepEqual(request, { id: 1, method: 'set_bright', params: [45, 'smooth', 500] });
});

test('reports rejection and unavailable LAN control instead of claiming success', async t => {
    const port = await createLamp(t, socket => socket.end('{"id":1,"error":{"message":"not supported"}}\r\n'));
    await assert.rejects(sendYeelightCommand('127.0.0.1', 'toggle', null, { port }), /not supported/);
    await assert.rejects(sendYeelightCommand('127.0.0.1', 'set_brightness', 0, { port }), /tussen 1 en 100/);
});

test('times out when the lamp does not confirm a command', async t => {
    const port = await createLamp(t, () => {});
    await assert.rejects(sendYeelightCommand('127.0.0.1', 'turn_on', null, { port, timeout: 50 }), /LAN-beheer/);
});

test('reads the actual lamp power and brightness', async t => {
    const port = await createLamp(t, socket => socket.end('{"id":1,"result":["off","30"]}\r\n'));
    assert.deepEqual(await getYeelightState('127.0.0.1', { port }), { on: false, brightness: 30 });
});

test('recognizes Yeelight models without relying on a custom display name', () => {
    assert.equal(isYeelight({ name: 'Keuken', model: 'yeelink.light.color' }), true);
    assert.equal(isYeelight({ name: 'Lamp', protocol: 'hue' }), false);
});
