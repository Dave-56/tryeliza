FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy all files
COPY . .

# Expose the port your app runs on
EXPOSE 5001

# Start the application with tsx (TypeScript executor)
CMD ["npx", "tsx", "src/app.ts"]