# Use a specific Node LTS version for reproducibility
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy package files first — Docker caches this layer
# so npm install only re-runs when package.json changes
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy source code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Health check so container orchestrators know when the app is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "src/app.js"]
