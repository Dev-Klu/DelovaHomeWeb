(function () {
    const $ = id => document.getElementById(id);
    const esc = HL.esc;
    let overview = null;
    let loading = false;

    function render() {
        const networks = overview.networks || [];
        const filter = $('deviceNetworkFilter');
        const selected = filter.value;
        filter.innerHTML = '<option value="all">Alle netwerken</option>' +
            networks.map(network => `<option value="${esc(network.id)}">${esc(network.name)}</option>`).join('');
        filter.value = networks.some(network => network.id === selected) ? selected : 'all';

        const query = $('deviceNetworkSearch').value.trim().toLowerCase();
        const rows = [];
        networks.forEach(network => {
            if (filter.value !== 'all' && network.id !== filter.value) return;
            (network.devices || []).forEach(device => {
                if ([device.name, device.ip, device.mac, device.hostname, device.vendor]
                    .filter(Boolean).join(' ').toLowerCase().includes(query)) rows.push({ device, network });
            });
        });
        rows.sort((a, b) => Number(b.device.online === true) - Number(a.device.online === true) ||
            a.device.ip.localeCompare(b.device.ip, undefined, { numeric: true }));
        const scanning = networks.some(network => network.scanning);
        const total = networks.reduce((count, network) => count + (network.devices || []).length, 0);
        const online = networks.reduce((count, network) => count + (network.deviceCount || 0), 0);
        $('deviceNetworkSummary').textContent = `${total} bekend · ${online} bereikbaar${scanning ? ' · scan bezig' : ''}`;
        if (!rows.length) {
            $('deviceNetworkList').innerHTML = `<div class="hl-empty">${scanning ? 'Netwerken worden gescand...' : 'Geen apparaten voor deze selectie. Controleer de route of start een scan.'}</div>`;
            return;
        }
        $('deviceNetworkList').innerHTML = '<div class="hl-table-wrap"><table class="hl-table"><thead><tr><th>Apparaat</th><th>Netwerk</th><th>Status</th><th>Actie</th></tr></thead><tbody>' +
            rows.map(({ device, network }) => {
                const known = typeof allDevices !== 'undefined' && allDevices.some(item => item.ip === device.ip);
                const status = device.online === true ? 'Bereikbaar' : device.online === false ? 'Offline' : 'Niet bevestigd';
                const statusClass = device.online === true ? 'ok' : device.online === false ? 'bad' : '';
                const ports = Array.isArray(device.openPorts) && device.openPorts.length
                    ? ` · poorten ${device.openPorts.join(', ')}` : '';
                return `<tr><td><strong>${esc(device.name)}</strong><div class="hl-row-sub hl-mono">${esc(device.ip)}${esc(ports)}</div></td>` +
                    `<td>${esc(network.name)}</td><td><span class="hl-badge ${statusClass}">${status}</span></td>` +
                    `<td><div class="hl-devices-actions"><button class="hl-device-row-action" type="button" data-device-ip="${esc(device.ip)}">${known ? 'Bediening' : 'Ander apparaat'}</button>` +
                    `<button class="hl-device-row-action" type="button" data-tv-ip="${esc(device.ip)}">Tv toevoegen</button></div></td></tr>`;
            }).join('') + '</tbody></table></div>';
    }

    async function refresh() {
        if (loading) return;
        loading = true;
        try {
            overview = await HL.api('/api/network/overview');
            render();
        } catch (error) {
            $('deviceNetworkSummary').textContent = 'Netwerkstatus niet beschikbaar';
            $('deviceNetworkList').textContent = error.message;
        } finally {
            loading = false;
        }
    }

    $('deviceNetworkSearch').addEventListener('input', () => { if (overview) render(); });
    $('deviceNetworkFilter').addEventListener('change', () => { if (overview) render(); });
    document.addEventListener('devices-list-updated', () => { if (overview) render(); });
    function openTvDialog(ip) {
        $('deviceTvForm').reset();
        $('deviceTvIp').value = ip || '';
        $('deviceTvDescription').textContent = 'Kies het tv-platform. Je koppelt de tv daarna vanuit de bediening.';
        $('deviceTvStatus').textContent = '';
        $('deviceTvDialog').showModal();
    }
    $('deviceTvManual').addEventListener('click', () => openTvDialog(''));
    $('deviceNetworkList').addEventListener('click', event => {
        const tvButton = event.target.closest('[data-tv-ip]');
        if (tvButton) {
            openTvDialog(tvButton.dataset.tvIp);
            return;
        }
        const button = event.target.closest('[data-device-ip]');
        if (!button) return;
        const ip = button.dataset.deviceIp;
        const known = typeof allDevices !== 'undefined' && allDevices.find(device => device.ip === ip);
        if (known && window.openDeviceDetail) window.openDeviceDetail(known.id);
        else if (window.openManualPairing) window.openManualPairing(ip);
    });
    $('deviceTvCancel').addEventListener('click', () => $('deviceTvDialog').close());
    $('deviceTvForm').addEventListener('submit', async event => {
        event.preventDefault();
        const button = $('deviceTvSubmit');
        button.disabled = true;
        $('deviceTvStatus').textContent = 'Tv toevoegen...';
        try {
            const response = await fetch('/api/network/devices/tv', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip: $('deviceTvIp').value.trim(), type: $('deviceTvType').value })
            });
            const result = await response.json();
            if (!response.ok || !result.ok) throw new Error(result.message || `HTTP ${response.status}`);
            if (!window.refreshDeviceList) throw new Error('Apparatenlijst is niet beschikbaar.');
            await window.refreshDeviceList();
            if (typeof allDevices === 'undefined' || !allDevices.some(device => device.id === result.deviceId)) {
                throw new Error('Tv opgeslagen, maar de apparatenlijst kon niet worden bijgewerkt.');
            }
            $('deviceTvDialog').close();
            window.openDeviceDetail(result.deviceId);
            refresh();
        } catch (error) {
            $('deviceTvStatus').textContent = `Tv toevoegen mislukt: ${error.message}`;
        } finally {
            button.disabled = false;
        }
    });
    $('deviceNetworkScan').addEventListener('click', async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
            await HL.api('/api/network/scan', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
            });
            $('deviceNetworkSummary').textContent = 'Scan gestart; dit kan enkele minuten duren.';
            setTimeout(refresh, 1000);
        } catch (error) {
            $('deviceNetworkSummary').textContent = `Scan niet gestart: ${error.message}. Een beheerder is vereist.`;
        } finally {
            button.disabled = false;
        }
    });
    refresh();
    setInterval(refresh, 8000);
})();
