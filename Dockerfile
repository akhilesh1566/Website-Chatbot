# --- Stage 1: Builder ---
# This stage installs all dependencies, including devDependencies needed for any build steps.
FROM node:20-slim AS builder
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application source code
COPY . .


# --- Stage 2: Production ---
# This stage creates the final, lean image for production.
FROM node:20-slim
WORKDIR /app

# Copy only the necessary files from the 'builder' stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.js ./server.js

# GCP Cloud Run requires the server to listen on a port specified by the PORT environment variable.
# Our server.js already does this: const PORT = process.env.PORT || 3000;
# We expose a default port here, but Cloud Run will override it.
EXPOSE 3000

# The command to start our application
CMD ["node", "server.js"]