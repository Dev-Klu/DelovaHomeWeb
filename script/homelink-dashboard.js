/* HomeLink dashboard: network / NAS / security / automations overview */
(function () {
    var $ = function (id) { return document.getElementById(id); };
    var esc = HL.esc;
    var state = { ov: null, devices: [], security: null, automations: [] };

    function greeting() {
        var h = new Date().getHours();
        var part = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
        var name = localStorage.getItem('username');
        $('hlGreeting').innerHTML = part + (name ? ', <span>' + esc(name) + '</span>' : '');
    }

    function kpi(href, icon, color, label, valueId, sub) {
        return '<a class="hl-kpi hl-rise" href="' + href + '" style="--kpi:' + color + '">' +
            '<span class="hl-kpi-ico"><i class="fas ' + icon + '"></i></span>' +
            '<span class="hl-kpi-body"><span class="hl-kpi-label">' + label + '</span><br>' +
            '<span class="hl-kpi-value" id="' + valueId + '">0</span>' +
            '<span class="hl-kpi-sub" style="display:block">' + sub + '</span></span></a>';
    }

    function renderKpis() {
        var ov = state.ov || { networks: [], tailscale: {}, nas: [], internet: {} };
        var devs = state.devices || [];
        var devOn = devs.filter(function (d) { return d.online !== false; }).length;
        var netsOn = ov.networks.filter(function (n) { return n.status === 'online'; }).length;
        var peers = (ov.tailscale.peers || []);
        var peersOn = peers.filter(function (p) { return p.online; }).length;
        var nasOn = (ov.nas || []).filter(function (n) { return n.online; }).length;
        var sec = state.security;
        var secLabel = !sec ? '—' : sec.mode === 'disarmed' ? 'Uit' : sec.mode === 'armed_home' ? 'Thuis' : 'Weg';

        var box = $('hlKpis');
        if (!box.dataset.ready) {
            box.dataset.ready = '1';
            box.innerHTML =
                kpi('devices.html', 'fa-lightbulb', '#fbbf24', 'Slimme apparaten', 'kDev', '<span id="kDevSub"></span>') +
                kpi('network.html', 'fa-network-wired', '#22d3ee', 'Netwerken online', 'kNet', '<span id="kNetSub"></span>') +
                kpi('network.html#tailscale', 'fa-shield-halved', '#a855f7', 'Tailscale nodes', 'kTs', '<span id="kTsSub"></span>') +
                kpi('files.html', 'fa-server', '#34d399', 'NAS online', 'kNas', '<span id="kNasSub"></span>') +
                kpi('network.html', 'fa-gauge-high', '#6366f1', 'Internet latency', 'kLat', 'naar 1.1.1.1') +
                kpi('#', 'fa-lock', '#fb7185', 'Beveiliging', 'kSec', '<span id="kSecSub"></span>');
        }
        HL.countUp($('kDev'), devOn);
        $('kDevSub').textContent = 'van ' + devs.length + ' gekoppeld';
        HL.countUp($('kNet'), netsOn);
        $('kNetSub').textContent = 'van ' + ov.networks.length + ' · Starlink / Proximus';
        HL.countUp($('kTs'), peersOn);
        $('kTsSub').textContent = ov.tailscale.installed ? 'van ' + peers.length + ' peers' : 'niet gevonden';
        HL.countUp($('kNas'), nasOn);
        $('kNasSub').textContent = 'van ' + (ov.nas || []).length + ' geconfigureerd';
        if (ov.internet && ov.internet.latency != null) HL.countUp($('kLat'), ov.internet.latency, { suffix: ' ms' });
        else $('kLat').textContent = ov.internet && ov.internet.online === false ? 'Offline' : '—';
        $('kSec').textContent = secLabel;
        $('kSecSub').textContent = sec ? (sec.status || '') : 'onbekend';
    }

    function renderHealth() {
        var ov = state.ov;
        var pill = $('hlHealthPill');
        if (!ov) { return; }
        var down = ov.networks.filter(function (n) { return n.status === 'offline'; }).length;
        var cls = 'ok', text = 'Alle systemen operationeel';
        if (ov.internet.online === false) { cls = 'bad'; text = 'Geen internetverbinding'; }
        else if (down) { cls = 'warn'; text = down + (down === 1 ? ' gateway reageert' : ' gateways reageren') + ' niet'; }
        pill.innerHTML = '<span class="hl-dot ' + cls + '"></span><span>' + text + '</span>';
    }

    function renderTopology() {
        if (state.ov) $('hlTopology').innerHTML = HL.topology(state.ov);
    }

    function renderDevices() {
        var ov = state.ov;
        var box = $('hlDevices');
        var all = [];
        ov.networks.forEach(function (n) {
            n.devices.forEach(function (d) { all.push({ d: d, net: n }); });
        });
        var scanning = ov.networks.some(function (n) { return n.scanning; });
        $('hlScanState').innerHTML = scanning ? '<span class="hl-spinner"></span> scannen…' : '';
        if (!all.length) {
            box.innerHTML = '<div class="hl-empty">' + (scanning ? 'Eerste scan bezig…' : 'Nog geen apparaten gevonden. Start een netwerkscan.') + '</div>';
            return;
        }
        all.sort(function (a, b) { return (b.d.online - a.d.online) || (b.d.isNew - a.d.isNew); });
        var rows = all.slice(0, 8).map(function (x) {
            var d = x.d;
            return '<tr><td><strong>' + esc(d.name) + '</strong>' + (d.isNew ? ' <span class="hl-badge new">Nieuw</span>' : '') + (d.linked ? ' <span class="hl-badge vio">Herkend</span>' : '') + '</td>' +
                '<td class="hl-mono">' + esc(d.ip) + '</td>' +
                '<td>' + esc(x.net.name) + '</td>' +
                '<td class="hl-mono">' + (d.latency != null ? d.latency + ' ms' : '—') + '</td>' +
                '<td><span class="hl-badge ' + (d.online === true ? 'ok' : d.online === false ? 'bad' : '') + '">' + (d.online === true ? 'Bereikbaar' : d.online === false ? 'Offline' : 'Niet bevestigd') + '</span></td></tr>';
        }).join('');
        box.innerHTML = '<table class="hl-table"><thead><tr><th>Apparaat</th><th>IP</th><th>Netwerk</th><th>Latency</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>' +
            (all.length > 8 ? '<div style="padding:10px 12px"><a class="hl-link" href="network.html">Alle ' + all.length + ' apparaten bekijken →</a></div>' : '');
    }

    function renderTailscale() {
        var ts = state.ov.tailscale;
        var box = $('hlTailscale');
        if (!ts.installed) {
            box.innerHTML = '<div class="hl-empty">Tailscale is niet gevonden op deze server. Installeer Tailscale en meld aan met <span class="hl-mono">tailscale up</span> om extern toegang te krijgen.</div>';
            return;
        }
        var nodes = (ts.self ? [ts.self] : []).concat(ts.peers).slice(0, 5);
        box.innerHTML = '<ul class="hl-list">' + nodes.map(function (n, i) {
            return '<li class="hl-row"><span class="hl-row-ico"><i class="fas ' + (/ios|android/i.test(n.os) ? 'fa-mobile-screen' : 'fa-laptop') + '"></i></span>' +
                '<span class="hl-row-main"><div class="hl-row-title">' + esc(n.name) + (i === 0 && ts.self ? ' <span class="hl-badge">deze hub</span>' : '') + '</div>' +
                '<div class="hl-row-sub">' + esc(n.ips[0] || '') + '</div></span>' +
                (n.routes && n.routes.length ? '<span class="hl-badge vio">subnet</span>' : '') +
                '<span class="hl-dot ' + (n.online ? 'ok' : '') + '"></span></li>';
        }).join('') + '</ul>';
    }

    function renderNas() {
        var list = state.ov.nas || [];
        var box = $('hlNas');
        if (!list.length) { box.innerHTML = '<div class="hl-empty">Geen NAS geconfigureerd. Voeg er een toe via Instellingen.</div>'; return; }
        box.innerHTML = '<ul class="hl-list">' + list.map(function (n) {
            return '<li class="hl-row"><span class="hl-row-ico"><i class="fas fa-hard-drive"></i></span>' +
                '<span class="hl-row-main"><div class="hl-row-title">' + esc(n.name) + '</div><div class="hl-row-sub">' + esc(n.host) + (n.share ? ' / ' + esc(n.share) : '') + '</div></span>' +
                '<span class="hl-row-end">' + (n.latency != null ? n.latency + ' ms' : '') + '</span>' +
                '<span class="hl-dot ' + (n.online ? 'ok' : n.online === false ? 'bad' : '') + '"></span></li>';
        }).join('') + '</ul>';
    }

    function renderSecurity() {
        var sec = state.security;
        var box = $('hlSecurity');
        if (!sec) { box.innerHTML = '<div class="hl-empty">Beveiligingsstatus niet beschikbaar.</div>'; return; }
        var armed = sec.mode && sec.mode !== 'disarmed';
        var alarm = sec.activeAlarms && sec.activeAlarms.length;
        var label = alarm ? 'ALARM actief' : armed ? (sec.mode === 'armed_home' ? 'Ingeschakeld – thuis' : 'Ingeschakeld – weg') : 'Uitgeschakeld';
        box.innerHTML = '<div class="hl-security-state"><div class="hl-shield ' + (alarm ? 'alarm' : armed ? 'armed' : '') + '"><i class="fas ' + (alarm ? 'fa-bell' : armed ? 'fa-lock' : 'fa-lock-open') + '"></i></div>' +
            '<div><div style="font-weight:700;font-size:1.05rem">' + label + '</div><div class="hl-row-sub">' + esc(sec.status || '') + '</div></div></div>' +
            '<div class="hl-tabs" style="margin-top:14px">' +
            '<button class="hl-tab ' + (sec.mode === 'armed_home' ? 'active' : '') + '" data-sec="armed_home">Thuis</button>' +
            '<button class="hl-tab ' + (sec.mode === 'armed_away' ? 'active' : '') + '" data-sec="armed_away">Weg</button>' +
            '<button class="hl-tab ' + (sec.mode === 'disarmed' ? 'active' : '') + '" data-sec="disarmed">Uit</button></div>';
    }

    function renderAutomations() {
        var list = state.automations || [];
        var box = $('hlAutomations');
        if (!list.length) { box.innerHTML = '<div class="hl-empty">Nog geen automatiseringen. Maak je eerste regel aan.</div>'; return; }
        var active = list.filter(function (a) { return a.enabled !== false; }).length;
        box.innerHTML = '<div class="hl-row-sub" style="margin-bottom:10px">' + active + ' van ' + list.length + ' actief</div><ul class="hl-list">' +
            list.slice(0, 4).map(function (a) {
                return '<li class="hl-row"><span class="hl-row-ico"><i class="fas fa-bolt"></i></span><span class="hl-row-main"><div class="hl-row-title">' + esc(a.name || a.id) + '</div></span>' +
                    '<span class="hl-dot ' + (a.enabled !== false ? 'ok' : '') + '"></span></li>';
            }).join('') + '</ul>';
    }

    async function refresh() {
        var r = await Promise.allSettled([
            HL.api('/api/network/overview'),
            HL.api('/api/devices'),
            HL.api('/api/security'),
            HL.api('/api/automations')
        ]);
        if (r[0].status === 'fulfilled') state.ov = r[0].value;
        else if (r[0].reason && r[0].reason.auth) $('hlSubtitle').textContent = r[0].reason.message;
        if (r[1].status === 'fulfilled' && Array.isArray(r[1].value)) state.devices = r[1].value;
        if (r[2].status === 'fulfilled') state.security = r[2].value;
        if (r[3].status === 'fulfilled') state.automations = Array.isArray(r[3].value) ? r[3].value : (r[3].value.automations || []);

        if (!state.ov) {
            ['hlTopology', 'hlDevices', 'hlTailscale', 'hlNas'].forEach(function (id) {
                $(id).innerHTML = '<div class="hl-empty">Netwerkgegevens niet beschikbaar' + (r[0].reason && r[0].reason.auth ? ' – log opnieuw in.' : '.') + '</div>';
            });
            $('hlKpis').innerHTML = ''; delete $('hlKpis').dataset.ready;
            renderSecurity(); renderAutomations(); return;
        }
        renderKpis(); renderHealth(); renderTopology(); renderDevices(); renderTailscale(); renderNas(); renderSecurity(); renderAutomations();
    }

    document.addEventListener('click', async function (e) {
        var tab = e.target.closest('[data-sec]');
        if (tab) {
            var mode = tab.dataset.sec;
            var pin = window.prompt('PIN-code');
            if (pin === null) return;
            try {
                await HL.api(mode === 'disarmed' ? '/api/security/disarm' : '/api/security/arm', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: mode, pin: pin })
                });
            } catch (err) { alert('Ongeldige PIN-code'); }
            refresh();
        }
        if (e.target.closest('#hlScanBtn')) {
            try {
                await HL.api('/api/network/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                $('hlScanState').innerHTML = '<span class="hl-spinner"></span> scannen…';
                setTimeout(refresh, 2000);
            } catch (err) { alert(err.auth ? err.message : 'Alleen beheerders kunnen scannen'); }
        }
    });

    greeting();
    refresh();
    setInterval(refresh, 10000);
})();
