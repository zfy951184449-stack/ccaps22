FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
# Force install ALL deps (including devDeps like typescript) regardless of NODE_ENV
RUN npm install --include=dev

COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/server.js"]
