# Fresh VPS Deploy Checklist

A step-by-step guide to deploying MoneyTracker on a new VPS. Assumes Ubuntu 24.04
or similar; adjust package commands for other distributions.

---

## 1. Server preparation

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Install git (if not present)
sudo apt install -y git
```

---

## 2. Clone and configure

```bash
# Clone the repository
cd /srv
sudo git clone https://github.com/Dave7c7/MoneyTracker.git moneytracker
sudo chown -R $USER:$USER moneytracker
cd moneytracker

# Create the environment file
cp .env.example .env
```

Edit `.env` with secure values:

```bash
# Generate a strong database password
POSTGRES_PASSWORD=$(openssl rand -base64 24)
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"

# Generate the encryption key (REQUIRED for bank connections and 2FA)
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "ENCRYPTION_KEY=$ENCRYPTION_KEY"
```

**Save both values somewhere safe** — a password manager, not the server. The
encryption key cannot be recovered, and losing it makes stored bank tokens
unrecoverable.

Update `.env`:

```ini
DATABASE_URL=postgresql://moneytracker:YOUR_POSTGRES_PASSWORD@localhost:5432/moneytracker
POSTGRES_PASSWORD=YOUR_POSTGRES_PASSWORD
ENCRYPTION_KEY=YOUR_64_CHAR_HEX_KEY
APP_TIMEZONE=America/New_York  # or your timezone
```

---

## 3. Start the application

```bash
docker compose up -d
```

Verify it's running:

```bash
docker compose ps
docker compose logs -f app  # watch for errors, Ctrl+C to exit
```

The app is now on `http://localhost:3000`. **Do not expose this yet.**

---

## 4. Set the password

Visit `http://YOUR_SERVER_IP:3000` (or SSH tunnel: `ssh -L 3000:localhost:3000 user@server`)
and set your password. Until you do, the app is a blank page asking for one.

---

## 5. Set up HTTPS with a reverse proxy

The app binds to localhost only. Put a reverse proxy in front for HTTPS.

### Option A: Caddy (simplest)

```bash
sudo apt install -y caddy
```

Create `/etc/caddy/Caddyfile`:

```
money.yourdomain.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl reload caddy
```

Caddy handles TLS certificates automatically via Let's Encrypt.

### Option B: nginx + certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/moneytracker`:

```nginx
server {
    listen 80;
    server_name money.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/moneytracker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d money.yourdomain.com
```

---

## 6. Set up cron jobs

The app has no built-in scheduler. Add these to sync bank connections, check
alerts, and run backups:

```bash
crontab -e
```

Add:

```cron
# Sync bank connections daily at 7:17 AM
17 7 * * * cd /srv/moneytracker && docker compose run --rm migrate pnpm db:sync >> /var/log/moneytracker-sync.log 2>&1

# Check for alerts daily at 7:20 AM
20 7 * * * cd /srv/moneytracker && docker compose run --rm migrate pnpm db:check-alerts >> /var/log/moneytracker-alerts.log 2>&1

# Backup daily at 3:15 AM, keep 30 days
15 3 * * * cd /srv/moneytracker && docker compose exec -T db pg_dump -U moneytracker --clean --if-exists moneytracker | gzip > backups/moneytracker-$(date +\%Y-\%m-\%d-\%H\%M\%S).sql.gz 2>> /var/log/moneytracker-backup.log
```

Create the log files:

```bash
sudo touch /var/log/moneytracker-{sync,alerts,backup}.log
sudo chown $USER:$USER /var/log/moneytracker-*.log
```

---

## 7. Set up alerts (optional)

For phone notifications, set up an ntfy topic:

1. Create a private topic at [ntfy.sh](https://ntfy.sh) or self-host ntfy
2. Add to `.env`:

```ini
ALERT_WEBHOOK_URL=https://ntfy.sh/your-private-random-topic-name
APP_BASE_URL=https://money.yourdomain.com
```

3. Restart the app:

```bash
docker compose restart app
```

**Use a long random topic name** — anyone who knows it can read your alerts.
Better: use ntfy access control or self-host.

---

## 8. Firewall

Only allow SSH and HTTPS:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Port 3000 stays internal (localhost only).

---

## 9. Test the backup

**Do this before you have real data:**

```bash
cd /srv/moneytracker
mkdir -p backups

# Create a backup
docker compose exec -T db pg_dump -U moneytracker --clean --if-exists moneytracker \
  | gzip > backups/test-backup.sql.gz

# Verify it can be restored (this is safe on an empty database)
gunzip -c backups/test-backup.sql.gz \
  | docker compose exec -T db psql -U moneytracker -d moneytracker \
      --set ON_ERROR_STOP=1 --single-transaction
```

---

## 10. Enable two-factor authentication

Once signed in:

1. Go to **Account** → **Two-factor authentication**
2. Scan the QR code with your authenticator app
3. **Save the recovery codes** somewhere safe — they cannot be shown again

---

## 11. Off-site backup

A backup on the same server is not a backup. Weekly, copy the newest backup
somewhere else:

```bash
# Example: copy to a local machine
scp user@server:/srv/moneytracker/backups/moneytracker-*.sql.gz ~/backups/

# Or use rclone to sync to cloud storage
rclone copy /srv/moneytracker/backups remote:moneytracker-backups --max-age 7d
```

**Remember:** the backup contains encrypted bank tokens. The encryption key must
be stored separately (not with the backup) and must be kept safe — losing it
makes those tokens unrecoverable.

---

## Quick reference

| Task | Command |
|------|---------|
| Start | `docker compose up -d` |
| Stop | `docker compose down` |
| Logs | `docker compose logs -f app` |
| Sync banks | `docker compose run --rm migrate pnpm db:sync` |
| Check alerts | `docker compose run --rm migrate pnpm db:check-alerts` |
| Backup | `docker compose exec -T db pg_dump -U moneytracker ... \| gzip > backups/x.sql.gz` |
| Reset password | `docker compose run --rm migrate pnpm db:set-password` |
| Disable 2FA | `docker compose run --rm migrate pnpm db:disable-2fa` |

---

## Troubleshooting

### App won't start

```bash
docker compose logs app
```

Common issues:
- `DATABASE_URL` is wrong or the database container isn't running
- `ENCRYPTION_KEY` is missing (required for 2FA and bank connections)

### Can't connect to the app

- Check the firewall: `sudo ufw status`
- Check the proxy: `sudo nginx -t` or `sudo journalctl -u caddy`
- Check the app is running: `docker compose ps`

### Lost password

From the server:

```bash
docker compose run --rm migrate pnpm db:set-password
```

### Lost 2FA and recovery codes

From the server:

```bash
docker compose run --rm migrate pnpm db:disable-2fa
```

Then sign in with just the password and set up 2FA again.

### Bank sync fails

Check the sync log and the Connections page in the app. Common causes:
- SimpleFIN access was revoked — re-add the connection
- Network issue — the next cron run will retry
