#!/usr/bin/env bash
# VPS Setup Script - Run this ONCE on your VPS for first-time setup
# Usage: bash setup-vps.sh

set -euo pipefail

echo "🚀 Kreasya VPS Setup Script"
echo "================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "⚠️  Please run as root or with sudo"
    echo "Usage: sudo bash setup-vps.sh"
    exit 1
fi

# Configuration
APP_PATH="${APP_PATH:-/opt/kreasya}"
APP_USER="${APP_USER:-kreasya}"
NODE_VERSION="18"

echo "Configuration:"
echo "  App Path: $APP_PATH"
echo "  App User: $APP_USER"
echo "  Node.js Version: $NODE_VERSION"
echo ""

# Update system
echo "📦 Updating system packages..."
apt update && apt upgrade -y

# Install Node.js
echo "📦 Installing Node.js $NODE_VERSION..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs
    echo "✅ Node.js installed: $(node --version)"
else
    echo "✅ Node.js already installed: $(node --version)"
fi

# Install PM2
echo "📦 Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    echo "✅ PM2 installed: $(pm2 --version)"
else
    echo "✅ PM2 already installed: $(pm2 --version)"
fi

# Install Nginx
echo "📦 Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install -y nginx
    systemctl enable nginx
    systemctl start nginx
    echo "✅ Nginx installed"
else
    echo "✅ Nginx already installed"
fi

# Install certbot (for SSL)
echo "📦 Installing Certbot..."
if ! command -v certbot &> /dev/null; then
    apt install -y certbot python3-certbot-nginx
    echo "✅ Certbot installed"
else
    echo "✅ Certbot already installed"
fi

# Create application user (optional, for better security)
if id "$APP_USER" &>/dev/null; then
    echo "✅ User $APP_USER already exists"
else
    echo "👤 Creating application user: $APP_USER"
    useradd -r -s /bin/bash -d "$APP_PATH" -m "$APP_USER"
    echo "✅ User created"
fi

# Create application directory
echo "📁 Creating application directory..."
mkdir -p "$APP_PATH"
mkdir -p "$APP_PATH/logs"
chown -R "$APP_USER:$APP_USER" "$APP_PATH"
echo "✅ Directory created: $APP_PATH"

# Setup firewall
echo "🔒 Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw --force enable
    ufw allow ssh
    ufw allow http
    ufw allow https
    ufw status
    echo "✅ Firewall configured"
else
    echo "⚠️  UFW not installed, skipping firewall setup"
fi

# Create .env template
echo "📝 Creating .env template..."
cat > "$APP_PATH/.env" << 'EOF'
NODE_ENV=production
PORT=3000
SESSION_SECRET=CHANGE_THIS_TO_RANDOM_STRING

# Admin credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD=CHANGE_THIS_PASSWORD

# API Keys - Fill with your actual keys
REPLICATE_API_TOKEN=your-replicate-token
IDEOGRAM_API_KEY=your-ideogram-key
IDEOGRAM_BETA_API_KEY=your-ideogram-beta-key

# Optional: Midjourney
SALAI_TOKEN=
MIDJOURNEY_SERVER_ID=
MIDJOURNEY_CHANNEL_ID=
EOF

chown "$APP_USER:$APP_USER" "$APP_PATH/.env"
chmod 600 "$APP_PATH/.env"
echo "✅ .env template created (PLEASE EDIT THIS FILE!)"

# Setup Nginx config
echo "🌐 Setting up Nginx configuration..."
read -p "Enter your domain name (or press Enter to use IP): " DOMAIN_NAME

if [ -z "$DOMAIN_NAME" ]; then
    DOMAIN_NAME="_"
    echo "Using IP address (no domain)"
else
    echo "Using domain: $DOMAIN_NAME"
fi

cat > /etc/nginx/sites-available/kreasya << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Frontend static files
    location / {
        root $APP_PATH/public;
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-cache";
        
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    client_max_body_size 50M;
    
    access_log /var/log/nginx/kreasya-access.log;
    error_log /var/log/nginx/kreasya-error.log;
}
EOF

# Enable Nginx site
ln -sf /etc/nginx/sites-available/kreasya /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test and reload Nginx
nginx -t && systemctl reload nginx
echo "✅ Nginx configured and reloaded"

# Setup SSL if domain provided
if [ "$DOMAIN_NAME" != "_" ]; then
    read -p "Do you want to setup SSL with Let's Encrypt? (y/n): " SETUP_SSL
    if [ "$SETUP_SSL" = "y" ] || [ "$SETUP_SSL" = "Y" ]; then
        echo "📜 Setting up SSL certificate..."
        read -p "Enter your email for SSL certificate: " SSL_EMAIL
        certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos -m "$SSL_EMAIL"
        echo "✅ SSL certificate installed"
    fi
fi

echo ""
echo "================================"
echo "✅ VPS Setup Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit .env file with your API keys:"
echo "   nano $APP_PATH/.env"
echo ""
echo "2. Deploy your application from local machine:"
echo "   export VPS_HOST=$(hostname -I | awk '{print $1}')"
echo "   export VPS_USER=root"
echo "   export VPS_PATH=$APP_PATH"
echo "   ./quick-deploy.sh"
echo ""
echo "3. After first deploy, setup PM2 startup:"
echo "   pm2 startup"
echo "   pm2 save"
echo ""
echo "4. Monitor your application:"
echo "   pm2 status"
echo "   pm2 logs kreasya"
echo ""
if [ "$DOMAIN_NAME" != "_" ]; then
    echo "Your app will be available at: http://$DOMAIN_NAME"
else
    echo "Your app will be available at: http://$(hostname -I | awk '{print $1}')"
fi
echo ""
