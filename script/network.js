(function () {
    var $ = function (id) { return document.getElementById(id); };
    var esc = HL.esc;
    var ov = null, tab = 'all', query = '';

    function cards() {
        $('nwCards').innerHTML = ov.networks.map(function (n, i) {
            var cls = n.status === 'online' ? 'ok' : n.status === 'offline' ? 'bad' : '';
            return '<article class="hl-panel hl-rise" style="--i:' + (i + 2) + '">' +
                '<div class="hl-panel-head"><h3 class="hl-panel-title"><i class="fas ' + (n.id === 'starlink' ? 'fa-satellite-dish' : 'fa-ethernet') + '"></i> ' + esc(n.name) + ' · ' + esc(n.location) + '</h3>' +
                '<span class="hl-pill"><span class="hl-dot ' + cls + '"></span>' + (n.status === 'online' ? 'Gateway bereikbaar' : n.status === 'offline' ? 'Gateway reageert niet' : 'Gateway controleren…') + '</span></div>' +
                '<div class="hl-row-sub" style="margin-bottom:8px">' + esc(n.cidr) + ' · gateway ' + esc(n.gateway) + '</div>' +
                HL.spark(n.history) +
                '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:.82rem;color:var(--text-muted)">' +
                '<span><b style="color:var(--text)">' + n.deviceCount + '</b> apparaten' + (n.newCount ? ' · <span class="hl-badge new">' + n.newCount + ' nieuw</span>' : '') + '</span>' +
                '<span>' + (n.latency != null ? n.latency + ' ms' : '—') + (n.scanning ? ' · <span class="hl-spinner"></span>' : '') + '</span></div></article>';
        }).join('');
    }

    function tabs() {
        var items = [{ id: 'all', name: 'Alle' }].concat(ov.networks.map(function (n) { return { id: n.id, name: n.name }; }));
        $('nwTabs').innerHTML = items.map(function (t) {
            return '<button class="hl-tab ' + (t.id === tab ? 'active' : '') + '" data-tab="' + esc(t.id) + '">' + esc(t.name) + '</button>';
        }).join('');
    }

    function devices() {
        var rows = [];
        ov.networks.forEach(function (n) {
            if (tab !== 'all' && tab !== n.id) return;
            n.devices.forEach(function (d) { rows.push({ d: d, n: n }); });
        });
        var q = query.trim().toLowerCase();
        if (q) rows = rows.filter(function (x) {
            return [x.d.name, x.d.ip, x.d.mac, x.d.hostname, x.d.vendor].join(' ').toLowerCase().indexOf(q) !== -1;
        });
        rows.sort(function (a, b) { return (b.d.online - a.d.online) || a.d.ip.localeCompare(b.d.ip, undefined, { numeric: true }); });
        if (!rows.length) { $('nwDevices').innerHTML = '<div class="hl-empty">Geen apparaten gevonden.</div>'; return; }
        $('nwDevices').innerHTML = '<table class="hl-table"><thead><tr><th>Naam</th><th>IP</th><th>MAC</th><th>Fabrikant</th><th>Netwerk</th><th>Latency</th><th>Status</th></tr></thead><tbody>' +
            rows.map(function (x) {
                var d = x.d;
                return '<tr><td><a href="#" data-rename="' + esc(d.key) + '" data-name="' + esc(d.name) + '" title="Klik om te hernoemen"><strong>' + esc(d.name) + '</strong></a>' +
                    (d.isGateway ? ' <span class="hl-badge">gateway</span>' : '') + (d.isNew ? ' <span class="hl-badge new">Nieuw</span>' : '') + (d.linked ? ' <span class="hl-badge vio">Herkend</span>' : '') + '</td>' +
                    '<td class="hl-mono">' + esc(d.ip) + '</td><td class="hl-mono">' + esc(d.mac || '—') + '</td><td>' + esc(d.vendor || '—') + '</td>' +
                    '<td>' + esc(x.n.name) + '</td><td class="hl-mono">' + (d.latency != null ? d.latency + ' ms' : '—') + '</td>' +
                    '<td><span class="hl-badge ' + (d.online === true ? 'ok' : d.online === false ? 'bad' : '') + '">' + (d.online === true ? 'Bereikbaar' : d.online === false ? 'Offline' : 'Niet bevestigd') + (d.lastSeen && d.online !== true ? ' · ' + HL.ago(d.lastSeen) : '') + '</span></td></tr>';
            }).join('') + '</tbody></table>';
    }

    function tailscale() {
        var ts = ov.tailscale;
        $('nwTailnet').textContent = ts.tailnet || '';
        if (!ts.installed) {
            $('nwTailscale').innerHTML = '<div class="hl-empty">Tailscale CLI niet gevonden. Installeer en activeer Tailscale op de server. De subnetrouter moet het externe subnet aankondigen; keur de route goed en accepteer routes op deze server.</div>';
            return;
        }
        var nodes = (ts.self ? [ts.self] : []).concat(ts.peers);
        $('nwTailscale').innerHTML = '<table class="hl-table"><thead><tr><th>Node</th><th>Tailscale IP</th><th>OS</th><th>Routes</th><th>Status</th></tr></thead><tbody>' +
            nodes.map(function (n) {
                return '<tr><td><strong>' + esc(n.name) + '</strong>' + (n === ts.self ? ' <span class="hl-badge">deze hub</span>' : '') + (n.exitNode ? ' <span class="hl-badge vio">exit node</span>' : '') + '</td>' +
                    '<td class="hl-mono">' + esc(n.ips[0] || '—') + '</td><td>' + esc(n.os || '—') + '</td>' +
                    '<td class="hl-mono">' + esc((n.routes || []).join(', ') || '—') + '</td>' +
                    '<td><span class="hl-badge ' + (n.online ? 'ok' : 'bad') + '">' + (n.online ? 'Online' : 'Offline') + '</span></td></tr>';
            }).join('') + '</tbody></table>';
    }

    async function refresh() {
        try {
            ov = await HL.api('/api/network/overview');
        } catch (e) {
            $('nwUpdated').innerHTML = '<span class="hl-dot bad"></span><span>' + esc(e.message) + '</span>';
            return;
        }
        $('nwUpdated').innerHTML = '<span class="hl-dot ok"></span><span>Bijgewerkt ' + new Date(ov.timestamp).toLocaleTimeString('nl-BE') + '</span>';
        $('nwTopology').innerHTML = HL.topology(ov);
        cards(); tabs(); devices(); tailscale();
    }

    document.addEventListener('click', async function (e) {
        var t = e.target.closest('[data-tab]');
        if (t) { tab = t.dataset.tab; tabs(); devices(); return; }
        var r = e.target.closest('[data-rename]');
        if (r) {
            e.preventDefault();
            var name = window.prompt('Naam voor dit apparaat', r.dataset.name);
            if (name === null) return;
            try {
                await HL.api('/api/network/devices/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: r.dataset.rename, name: name }) });
                refresh();
            } catch (err) { alert('Alleen beheerders kunnen apparaten hernoemen'); }
            return;
        }
        if (e.target.closest('#nwScan')) {
            try {
                await HL.api('/api/network/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                setTimeout(refresh, 1500);
            } catch (err) { alert(err.auth ? err.message : 'Alleen beheerders kunnen scannen'); }
        }
    });
    $('nwSearch').addEventListener('input', function (e) { query = e.target.value; if (ov) devices(); });

    refresh();
    setInterval(refresh, 8000);
})();
