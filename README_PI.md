# HomeLink: lokale installatie

De accountdatabase kan lokaal draaien op dezelfde Linux-server als HomeLink.
Een internetverbinding is nodig voor de installatie; cloudafhankelijke
integraties blijven ook daarna internet vereisen.

## Nieuwe Ubuntu-installatie

Deze installatie is bedoeld voor een nieuwe installatie, niet voor een bestaande
HomeLink-service of SQL-database. Vereisten: Ubuntu op x86_64, Node.js 20 of
nieuwer met npm, Python 3 met `venv`, Docker, OpenSSL, curl en sudo. SQL Server
vereist minstens 2 GB geheugen. Installeer Docker en Python bijvoorbeeld met:

```bash
sudo apt update
sudo apt install -y docker.io python3-venv openssl curl
sudo systemctl enable --now docker
```

Installeer Node.js afzonderlijk als het nog ontbreekt. Lees daarna de
[Microsoft SQL Server-licentievoorwaarden](https://www.microsoft.com/en-us/sql-server/sql-server-downloads).
Vanuit de projectmap start je de installatie met:

```bash
bash builder/install-local.sh --accept-sql-eula
```

Het script maakt een lokale SQL Server Express-container met persistent
Docker-volume, een aparte databasegebruiker en een systemd-service. De database
luistert op de host alleen op `127.0.0.1`. De service wacht na een herstart op
de database. Wachtwoorden staan in `~/.config/homelink/`, buiten de webmap.
De installatie maakt daar ook een eigen zelfondertekend HTTPS-certificaat;
je browser kan daarvoor een waarschuwing tonen.
Bewaar een veilige back-up van die configuratie en het Docker-volume
`homelink-sql-data`. Verwijder het volume niet bij updates.

Het script overschrijft geen bestaande HomeLink-service, container, volume of
databaseconfiguratie. Als een installatie halverwege stopt, controleer eerst de
fout en bestaande data; voer het script niet blind opnieuw uit. Voor een
bestaande installatie moeten de nieuwe projectbestanden apart worden uitgerold.
Bij een nieuwe hub krijgt het eerste lokaal geregistreerde account de
beheerdersrol. Bestaande accountrollen worden niet gewijzigd.

HomeLink bevat bestaande API's die nog niet volledig zijn afgeschermd.
Stel de webserver niet rechtstreeks bloot aan het internet;
gebruik alleen een vertrouwd netwerk totdat die beveiliging is aangepakt.

## Apparaten en netwerkdetectie

De apparaatpagina onderscheidt netwerkdetectie van apparaten met bediening.
Een apparaat kan ping weigeren; daarom controleert de scan ook een beperkte
set TCP-poorten. Een apparaat dat geen antwoord geeft is **niet bevestigd**,
niet noodzakelijk offline. Deze scan kan niet alle apparaten vinden.

Een beheerder kan een Samsung Tizen- of Android TV/Google TV-apparaat ook via
zijn IP-adres toevoegen en vervolgens koppeling vanuit de bediening starten.
Bij Samsung moet de gebruiker het verzoek op de tv bevestigen; bij Android TV
wordt een code gevraagd. Niet alle TCL-tv's gebruiken Android TV; andere
platforms zoals Roku zijn hiermee niet automatisch ondersteund.

Voor Proximus moet de Ubuntu-server een werkende route naar
`192.168.0.0/24` hebben. Bij Tailscale moet de subnetrouter die route
aankondigen, een beheerder die goedkeuren en de Linux-server routes
accepteren. mDNS en SSDP worden niet vanzelf over Tailscale-subnetroutes
doorgestuurd, en een route geeft geen toegang tot apparaten die die toegang
blokkeren.

## Oudere Raspberry Pi-handleiding

## 1. Prerequisites
Ensure your Raspberry Pi is set up with Raspberry Pi OS.

Install Node.js (v18 or newer recommended) and Git:
```bash
sudo apt update
sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Clone the Repository
You must clone the repository for the update system to work.
```bash
cd /home/pi
git clone https://github.com/DelovaDigital/DelovaHomeWeb.git DelovaHome
cd DelovaHome/web
```
*Note: You may need to set up an SSH key or use a Personal Access Token if the repo is private.*

## 3. Install Dependencies
```bash
npm install
```

## 4. Generate SSL Certificates (Required for Spotify/HTTPS)
```bash
openssl req -nodes -new -x509 -keyout server.key -out server.cert -days 365 -subj "/CN=delovahome.local"
```

## 5. Setup Auto-Start (PM2)
We use PM2 to keep the server running and automatically restart it after updates.

```bash
sudo npm install -g pm2
pm2 start server.js --name "delovahome" -- --openssl-legacy-provider
pm2 save
pm2 startup
```
*Follow the command output from `pm2 startup` to enable boot on startup.*

## 6. Setup Kiosk Mode (Optional)
If you have a screen attached to the Pi and want to see the dashboard:
```bash
chmod +x builder/setup_kiosk.sh
./builder/setup_kiosk.sh
```
This will install a lightweight browser environment and auto-launch DelovaHome on boot.

## 7. Updating
You can now update the system directly from the web interface (Settings -> Check for updates).
When you release a new version on GitHub (push to main), the Pi will detect it.
