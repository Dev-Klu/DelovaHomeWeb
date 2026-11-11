const net = require('net');

function isYeelight(device) {
    return [device.name, device.protocol, device.model].some(value =>
        typeof value === 'string' && /yeelight|yeelink|ylbulb/i.test(value));
}

function sendYeelightCommand(ip, command, value, options = {}) {
    let method;
    let params;
    if (command === 'toggle') {
        method = 'toggle';
        params = [];
    } else if (command === 'turn_on' || command === 'turn_off') {
        method = 'set_power';
        params = [command === 'turn_on' ? 'on' : 'off', 'smooth', 500];
    } else if (command === 'set_brightness') {
        const brightness = Number(value);
        if (!Number.isInteger(brightness) || brightness < 1 || brightness > 100) {
            return Promise.reject(new Error('Helderheid moet tussen 1 en 100 liggen.'));
        }
        method = 'set_bright';
        params = [brightness, 'smooth', 500];
    } else if (command === 'set_color') {
        const rgb = typeof value === 'object' && value !== null &&
            ['r', 'g', 'b'].every(key => Number.isInteger(value[key]) && value[key] >= 0 && value[key] <= 255)
            ? (value.r << 16) + (value.g << 8) + value.b
            : typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
        if (!Number.isInteger(rgb) || rgb < 0 || rgb > 0xffffff) {
            return Promise.reject(new Error('Ongeldige kleur.'));
        }
        method = 'set_rgb';
        params = [rgb, 'smooth', 500];
    } else {
        return Promise.reject(new Error('Deze Yeelight-opdracht wordt niet ondersteund.'));
    }

    return requestYeelight(ip, method, params, options).then(result => {
        if (result[0] !== 'ok') throw new Error('Yeelight heeft de opdracht niet bevestigd.');
    });
}

async function getYeelightState(ip, options = {}) {
    const result = await requestYeelight(ip, 'get_prop', ['power', 'bright'], options);
    const brightness = Number(result[1]);
    if (!['on', 'off'].includes(result[0]) || !Number.isInteger(brightness) || brightness < 1 || brightness > 100) {
        throw new Error('Ongeldige status van Yeelight.');
    }
    return { on: result[0] === 'on', brightness };
}

function requestYeelight(ip, method, params, options) {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: ip, port: options.port || 55443 });
        let buffer = '';
        let settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (error) reject(error);
            else resolve(result);
        };
        socket.setTimeout(options.timeout || 4000);
        socket.on('connect', () => socket.write(JSON.stringify({ id: 1, method, params }) + '\r\n'));
        socket.on('data', data => {
            buffer += data.toString();
            if (buffer.length > 65536) return finish(new Error('Ongeldig antwoord van Yeelight.'));
            const lines = buffer.split('\r\n');
            buffer = lines.pop();
            for (const line of lines) {
                let response;
                try {
                    response = JSON.parse(line);
                } catch (error) {
                    return finish(new Error('Ongeldig antwoord van Yeelight.'));
                }
                if (response.id !== 1) continue;
                if (response.error) return finish(new Error(response.error.message || 'Yeelight heeft de opdracht geweigerd.'));
                if (Array.isArray(response.result)) return finish(null, response.result);
                return finish(new Error('Yeelight heeft geen geldig antwoord gegeven.'));
            }
        });
        socket.on('timeout', () => finish(new Error('Geen antwoord van Yeelight. Controleer LAN-beheer en de netwerkroute.')));
        socket.on('error', error => finish(new Error(`Yeelight niet bereikbaar: ${error.message}. Controleer LAN-beheer en de netwerkroute.`)));
        socket.on('close', () => finish(new Error('Yeelight verbrak de verbinding zonder bevestiging.')));
    });
}

module.exports = { isYeelight, sendYeelightCommand, getYeelightState };
