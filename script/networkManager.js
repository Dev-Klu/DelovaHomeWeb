const fs = require('fs');
const path = require('path');
const dns = require('dns');
const { execFile } = require('child_process');

const DATA_DIR = path.join(__dirname, '../data');
const CONFIG_PATH = path.join(DATA_DIR, 'network.json');
const INVENTORY_PATH = path.join(DATA_DIR, 'network_devices.json');

const DEFAULT_CONFIG = {
    networks: [
        { id: 'starlink', name: 'Starlink', location: 'Boven', cidr: '192.168.10.0/24', gateway: '192.168.10.1' },
        { id: 'proximus', name: 'Proximus', location: 'Beneden', cidr: '192.168.0.0/24', gateway: '192.168.0.1' }
    ],
    internetTarget: '1.1.1.1',
    healthIntervalMs: 15000,
    scanIntervalMs: 300000,
    pingTimeoutMs: 800,
    historyLength: 60
};

// Small OUI table for the most common home devices
const OUI = {
    'B8:27:EB': 'Raspberry Pi', 'DC:A6:32': 'Raspberry Pi', 'E4:5F:01': 'Raspberry Pi', 'D8:3A:DD': 'Raspberry Pi',
    '24:0A:C4': 'Espressif', '30:AE:A4': 'Espressif', '84:CC:A8': 'Espressif', 'A4:CF:12': 'Espressif', '3C:71:BF': 'Espressif',
    '00:11:32': 'Synology', '00:08:9B': 'QNAP',
    '00:0E:58': 'Sonos', '5C:AA:FD': 'Sonos', '94:9F:3E': 'Sonos', 'B8:E9:37': 'Sonos',
    '00:17:88': 'Philips Hue',
    '24:5A:4C': 'Ubiquiti', '78:8A:20': 'Ubiquiti', 'FC:EC:DA': 'Ubiquiti'
};

function loadJson(file, fallback) {
    try {
        if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        console.error(`[Network] Failed to read ${path.basename(file)}:`, e.message);
    }
    return fallback;
}

function isValidIPv4(ip) {
    return typeof ip === 'string' && /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip);
}

function runCommand(cmd, args, timeout) {
    return new Promise(resolve => {
        execFile(cmd, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
            resolve({ err, stdout: stdout || '' });
        });
    });
}

class NetworkManager {
    constructor() {
        this.config = { ...DEFAULT_CONFIG, ...loadJson(CONFIG_PATH, {}) };
        this.inventory = loadJson(INVENTORY_PATH, {});
        this.networks = {};
        this.config.networks.forEach(n => {
            this.networks[n.id] = {
                ...n,
                prefix: n.cidr.split('/')[0].split('.').slice(0, 3).join('.') + '.',
                gateway_status: { online: null, latency: null },
                history: [],
                devices: [],
                lastScan: null,
                scanning: false
            };
        });
        this.internet = { online: null, latency: null, history: [] };
        this.tailscale = { installed: false, online: false, self: null, peers: [], updatedAt: null };
        this.hostStatus = {};
        this.timers = [];
        this.started = false;
        this.deviceProvider = () => [];
        this.nasProvider = () => [];
    }

    setProviders({ devices, nas }) {
        if (devices) this.deviceProvider = devices;
        if (nas) this.nasProvider = nas;
    }

    start() {
        if (this.started) return;
        this.started = true;
        console.log('[Network] Starting network monitor...');
        this.refreshHealth();
        this.refreshTailscale();
        this.timers.push(setInterval(() => this.refreshHealth(), this.config.healthIntervalMs));
        this.timers.push(setInterval(() => this.refreshTailscale(), 30000));
        this.timers.push(setInterval(() => this.scanAll(), this.config.scanIntervalMs));
        this.timers.push(setTimeout(() => this.scanAll(), 8000));
        this.timers.forEach(t => t.unref && t.unref());
    }

    ping(ip, timeoutMs = this.config.pingTimeoutMs) {
        if (!isValidIPv4(ip) && !/^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i.test(String(ip))) return Promise.resolve({ online: false, latency: null });
        let args;
        if (process.platform === 'win32') args = ['-n', '1', '-w', String(timeoutMs), ip];
        else if (process.platform === 'darwin') args = ['-c', '1', '-W', String(timeoutMs), ip];
        else args = ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), ip];

        return runCommand('ping', args, timeoutMs + 2000).then(({ err, stdout }) => {
            if (err) return { online: false, latency: null };
            // Windows exits 0 on "destination unreachable"; real replies always include a TTL
            if (process.platform === 'win32' && !/ttl/i.test(stdout)) return { online: false, latency: null };
            const m = stdout.match(/[=<]\s*(\d+(?:[.,]\d+)?)\s*ms/i);
            return { online: true, latency: m ? Math.round(parseFloat(m[1].replace(',', '.'))) : 1 };
        });
    }

    pushHistory(list, latency) {
        list.push({ t: Date.now(), v: latency });
        while (list.length > this.config.historyLength) list.shift();
    }

    async refreshHealth() {
        const jobs = Object.values(this.networks).map(async net => {
            const r = await this.ping(net.gateway);
            net.gateway_status = r;
            this.pushHistory(net.history, r.online ? r.latency : null);
        });
        jobs.push((async () => {
            const r = await this.ping(this.config.internetTarget);
            this.internet.online = r.online;
            this.internet.latency = r.latency;
            this.pushHistory(this.internet.history, r.online ? r.latency : null);
        })());

        const nasList = this.nasProvider() || [];
        nasList.forEach(n => {
            if (!n.host) return;
            jobs.push(this.ping(n.host).then(r => { this.hostStatus[n.host] = { ...r, checkedAt: Date.now() }; }));
        });
        await Promise.all(jobs);
    }

    async refreshTailscale() {
        const candidates = ['tailscale'];
        if (process.platform === 'win32') candidates.push('C:\\Program Files\\Tailscale\\tailscale.exe');
        if (process.platform === 'darwin') candidates.push('/Applications/Tailscale.app/Contents/MacOS/Tailscale');

        for (const bin of candidates) {
            const { err, stdout } = await runCommand(bin, ['status', '--json'], 5000);
            if (err && !stdout) continue;
            try {
                const data = JSON.parse(stdout);
                const toNode = p => ({
                    id: p.ID,
                    name: p.HostName,
                    dns: (p.DNSName || '').replace(/\.$/, ''),
                    ips: (p.TailscaleIPs || []).filter(isValidIPv4),
                    os: p.OS || '',
                    online: !!p.Online,
                    lastSeen: p.LastSeen && !p.LastSeen.startsWith('0001') ? p.LastSeen : null,
                    exitNode: !!p.ExitNodeOption || !!p.ExitNode,
                    routes: p.PrimaryRoutes || [],
                    tags: p.Tags || []
                });
                this.tailscale = {
                    installed: true,
                    online: data.BackendState === 'Running',
                    state: data.BackendState,
                    tailnet: data.CurrentTailnet ? data.CurrentTailnet.Name : null,
                    self: data.Self ? { ...toNode(data.Self), online: true } : null,
                    peers: Object.values(data.Peer || {}).map(toNode),
                    updatedAt: Date.now()
                };
                return;
            } catch (e) { /* try next candidate */ }
        }
        this.tailscale = { installed: false, online: false, self: null, peers: [], updatedAt: Date.now() };
    }

    async readArp() {
        const table = {};
        const cmds = process.platform === 'win32' ? [['arp', ['-a']]] : [['ip', ['neigh']], ['arp', ['-an']]];
        for (const [cmd, args] of cmds) {
            const { stdout } = await runCommand(cmd, args, 5000);
            for (const line of stdout.split(/\r?\n/)) {
                const m = line.match(/(\d+\.\d+\.\d+\.\d+)\D+?([0-9a-f]{2}(?:[:-][0-9a-f]{2}){5})/i);
                if (m) table[m[1]] = m[2].toUpperCase().replace(/-/g, ':');
            }
            if (Object.keys(table).length) break;
        }
        return table;
    }

    reverseLookup(ip) {
        return new Promise(resolve => {
            const timer = setTimeout(() => resolve(null), 1200);
            dns.reverse(ip, (err, names) => {
                clearTimeout(timer);
                resolve(!err && names && names[0] ? names[0] : null);
            });
        });
    }

    async scanNetwork(id) {
        const net = this.networks[id];
        if (!net || net.scanning) return net;
        net.scanning = true;
        try {
            const gw = await this.ping(net.gateway, 1500);
            net.gateway_status = gw;
            if (!gw.online) {
                net.devices = net.devices.map(d => ({ ...d, online: false }));
                return net;
            }

            const hosts = [];
            for (let i = 1; i <= 254; i++) hosts.push(net.prefix + i);
            const found = [];
            let cursor = 0;
            const worker = async () => {
                while (cursor < hosts.length) {
                    const ip = hosts[cursor++];
                    const r = await this.ping(ip, 600);
                    if (r.online) found.push({ ip, latency: r.latency });
                }
            };
            await Promise.all(Array.from({ length: 48 }, worker));

            const arp = await this.readArp();
            const known = this.deviceProvider() || [];
            const now = new Date().toISOString();
            const firstScan = Object.keys(this.inventory).length === 0;
            const seen = new Set();

            const devices = await Promise.all(found.sort((a, b) => this.ipNum(a.ip) - this.ipNum(b.ip)).map(async f => {
                const mac = arp[f.ip] || null;
                const key = mac || `${id}:${f.ip}`;
                seen.add(key);
                let rec = this.inventory[key];
                if (!rec) {
                    rec = this.inventory[key] = { firstSeen: now, hostname: null, alias: null };
                    rec.isNewSinceInstall = !firstScan;
                }
                if (!rec.hostname) rec.hostname = await this.reverseLookup(f.ip);
                rec.lastSeen = now;
                rec.ip = f.ip;
                rec.network = id;
                const linked = known.find(d => (d.ip || d.host || d.address) === f.ip);
                const vendor = mac ? OUI[mac.slice(0, 8)] || null : null;
                const ageH = (Date.now() - new Date(rec.firstSeen).getTime()) / 3600000;
                return {
                    key,
                    ip: f.ip,
                    mac,
                    vendor,
                    hostname: rec.hostname,
                    name: rec.alias || (linked && linked.name) || rec.hostname || vendor || f.ip,
                    latency: f.latency,
                    online: true,
                    linked: !!linked,
                    isGateway: f.ip === net.gateway,
                    isNew: !!rec.isNewSinceInstall && ageH < 24,
                    firstSeen: rec.firstSeen
                };
            }));

            // Keep recently known devices as offline entries
            const cutoff = Date.now() - 7 * 86400000;
            const offline = Object.entries(this.inventory)
                .filter(([key, rec]) => rec.network === id && !seen.has(key) && new Date(rec.lastSeen).getTime() > cutoff)
                .map(([key, rec]) => ({
                    key, ip: rec.ip, mac: key.includes(':') && !key.includes(id + ':') ? key : null, vendor: null,
                    hostname: rec.hostname, name: rec.alias || rec.hostname || rec.ip, latency: null, online: false,
                    linked: false, isGateway: false, isNew: false, firstSeen: rec.firstSeen, lastSeen: rec.lastSeen
                }));

            net.devices = devices.concat(offline);
            net.lastScan = Date.now();
            this.saveInventory();
        } catch (e) {
            console.error(`[Network] Scan of ${id} failed:`, e.message);
        } finally {
            net.scanning = false;
        }
        return net;
    }

    ipNum(ip) {
        return ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
    }

    async scanAll() {
        for (const id of Object.keys(this.networks)) {
            await this.scanNetwork(id);
        }
    }

    saveInventory() {
        try {
            if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
            fs.writeFileSync(INVENTORY_PATH, JSON.stringify(this.inventory, null, 2));
        } catch (e) {
            console.error('[Network] Failed to save inventory:', e.message);
        }
    }

    renameDevice(key, alias) {
        const rec = this.inventory[key];
        if (!rec) return false;
        rec.alias = alias ? String(alias).slice(0, 60) : null;
        Object.values(this.networks).forEach(n => n.devices.forEach(d => { if (d.key === key) d.name = rec.alias || rec.hostname || d.ip; }));
        this.saveInventory();
        return true;
    }

    getOverview() {
        const networks = Object.values(this.networks).map(n => {
            const online = n.devices.filter(d => d.online);
            return {
                id: n.id,
                name: n.name,
                location: n.location,
                cidr: n.cidr,
                gateway: n.gateway,
                status: n.gateway_status.online === null ? 'unknown' : (n.gateway_status.online ? 'online' : 'offline'),
                latency: n.gateway_status.latency,
                history: n.history,
                scanning: n.scanning,
                lastScan: n.lastScan,
                deviceCount: online.length,
                newCount: online.filter(d => d.isNew).length,
                devices: n.devices
            };
        });
        const nas = (this.nasProvider() || []).map(n => {
            const s = this.hostStatus[n.host];
            return { ...n, online: s ? s.online : null, latency: s ? s.latency : null };
        });
        return {
            ok: true,
            timestamp: Date.now(),
            internet: this.internet,
            networks,
            tailscale: this.tailscale,
            nas
        };
    }
}

module.exports = new NetworkManager();
