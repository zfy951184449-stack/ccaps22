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

# Nginx config template (uses BACKEND_URL and PORT placeholders)
RUN cat > /etc/nginx/templates/default.conf.template << 'NGINX_CONF'
server {
    listen ${PORT};
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

    # WebSocket for solver progress
    location /ws/ {
        proxy_pass ${BACKEND_URL}/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # SPA: all other routes -> index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF

# nginx:alpine image auto-processes /etc/nginx/templates/*.template
# using envsubst, but only for specified vars (won't touch $host, $uri, etc.)
ENV PORT=8080
ENV BACKEND_URL=http://localhost:3001

EXPOSE 8080

# Only substitute our custom env vars, leave nginx vars ($host etc) alone
CMD ["/bin/sh", "-c", "envsubst '$PORT $BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
