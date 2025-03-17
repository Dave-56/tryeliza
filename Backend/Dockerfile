FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy application code
COPY . .

# Create dist directory and copy src to dist (bypass TypeScript compilation)
RUN mkdir -p dist && cp -r src/* dist/

# Expose the port your app runs on
EXPOSE 5001

# Start the application
CMD ["npm", "run", "start:prod"]