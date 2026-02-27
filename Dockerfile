FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application source
COPY . .

# Build the TypeScript project
RUN npm run build

# Make sure database directory exists
RUN mkdir -p database

# Create volume for persistent SQLite database
VOLUME ["/app/database"]

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
