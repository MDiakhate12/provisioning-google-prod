#! /bin/bash

# Install base packages
sudo apt update -y && sudo apt-get install -y apt-transport-https ca-certificates gnupg && sudo apt install -y curl

# Install git
sudo apt-get install -y git

# Install Nginx
sudo apt install -y nginx

# Install NodeJS, npm and yarn
curl -fsSL https://deb.nodesource.com/setup_14.x | sudo -E bash - 
sudo apt-get install -y nodejs 
sudo npm install --global yarn

# Install certbot
sudo apt install -y snapd && \
sudo snap install core; sudo snap refresh core 
sudo apt-get install -y certbot && \
sudo snap install --classic certbot 
sudo ln -s /snap/bin/certbot /usr/bin/certbot

# Deploy project
git clone ${PROJECT_REPOSITORY}
cd ${PROJECT_NAME}

DOTENV=".env"
# Check if .env exits
if ! test -f $DOTENV; then
    # If .env doesn't exist create it and set env variable
    echo "REACT_APP_BACKEND_URL=${BACKEND_URL}" > .env
else
    # If .env exists but env variable doesn't exist set env variable
    if ! grep -q "REACT_APP_BACKEND_URL" $DOTENV; then
        echo "REACT_APP_BACKEND_URL=${BACKEND_URL}" >> .env
    else 
    # if .env exists and env variable exist reset env variable
        sed -e -i "/REACT_APP_BACKEND_URL/c\REACT_APP_BACKEND_URL=${BACKEND_URL}" $DOTENV
    fi     
fi

yarn install
yarn build  

sudo rm -rf /var/www/html/*
sudo cp -r ./build/* /var/www/html

sudo cat << EOF > /tmp/nodejs.nginx.default
server {
        root /var/www/html;
        index index.html index.htm index.nginx-debian.html;

        server_name _;

        location / {
            try_files \$uri \$uri/ /index.html;
        }
}
EOF

sudo cp /tmp/nodejs.nginx.default /etc/nginx/sites-available/default
sudo nginx -t && sudo systemctl restart nginx