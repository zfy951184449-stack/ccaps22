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
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 600s;

        # SSE (Server-Sent Events) support: disable buffering
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_set_header X-Accel-Buffering no;
    }

    # WebSocket for solver progress
    location /ws/ {
        proxy_pass ${BACKEND_URL}/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 600s;
    }

    # SPA: all other routes -> index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF

ENV PORT=8080
ENV BACKEND_URL=

EXPOSE 8080

CMD ["/bin/sh", "-c", "if [ -z \"$BACKEND_URL\" ]; then echo 'ERROR: BACKEND_URL must point to the backend service, e.g. http://<backend-private-host>:3001' >&2; exit 1; fi; case \"$BACKEND_URL\" in http://localhost:*|https://localhost:*|http://127.*|https://127.*) echo \"ERROR: BACKEND_URL points to loopback ($BACKEND_URL). In Zeabur this must be the backend service private URL.\" >&2; exit 1;; esac; envsubst '$PORT $BACKEND_URL' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
