# Stage 1: Build React app
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve with nginx + API proxy
FROM nginx:alpine

# Copy built React app
COPY --from=build /app/build /usr/share/nginx/html

# Nginx config: SPA routing + API reverse proxy
RUN cat > /etc/nginx/conf.d/default.conf << 'EOF'
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # API requests -> proxy to backend service
    location /api/ {
        proxy_pass ${BACKEND_URL}/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 600s;
    }

    # SPA: all other routes -> index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Use envsubst to replace BACKEND_URL at runtime
CMD envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf > /tmp/default.conf \
    && mv /tmp/default.conf /etc/nginx/conf.d/default.conf \
    && nginx -g 'daemon off;'

EXPOSE 80
