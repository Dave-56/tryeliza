FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy all files
COPY Backend/ .

# Expose the port your app runs on
EXPOSE 5001

# Set environment variable
ENV NODE_ENV=production

# Start the application with tsx (TypeScript executor)
CMD ["npx", "tsx", "src/app.ts"]