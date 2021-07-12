!/bin/bash

# Install base packages
sudo apt update -y && sudo apt-get install -y apt-transport-https ca-certificates gnupg && sudo apt install -y curl

# Install git
sudo apt-get install -y git

# Install Nginx
sudo apt install -y nginx

# Install NodeJS and npm
curl -fsSL https://deb.nodesource.com/setup_14.x | sudo -E bash - 
sudo apt-get install -y nodejs 
    
# Install PM2
sudo npm install pm2 -g 

# Install certbot
sudo apt install -y snapd && \
sudo snap install core; sudo snap refresh core 
sudo apt-get install -y certbot && \
sudo snap install --classic certbot 
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Deploy project
git clone ${PROJECT_REPOSITORY}

# Install node packges
cd ${PROJECT_NAME}

npm install

touch ecosystem.config.js

# Create PM2 configuration file
cat <<EOF > ./ecosystem.config.js
module.exports = {
  apps: [{
    name: "${PROJECT_NAME}",
    script: "./${MAIN_FILE}",
    env: {
      "NODE_ENV": "production",
      "PORT": ${PORT},
      "DB_URI": "${DB_URI}"
    }
  }]
}
EOF



# Start PM2
pm2 start ecosystem.config.js

# Create nginx configuration file
sudo cat <<EOF > /tmp/nodejs.nginx.default
server {
        root /var/www/html;
        index index.html index.htm index.nginx-debian.html;

        server_name _;

        location / {
            proxy_pass http://localhost:${PORT};
            proxy_http_version 1.1;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host \$host;
            proxy_cache_bypass \$http_upgrade;
        }
}
EOF

# Test and start nginx
sudo cp /tmp/nodejs.nginx.default /etc/nginx/sites-available/default
sudo nginx -t && sudo systemctl restart nginx


