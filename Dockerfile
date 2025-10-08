# Use official Node.js LTS image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --production

# Copy source code
COPY . .

# Expose port (if your bot listens on a port, e.g., 3000)
EXPOSE 3000

# Start the bot
CMD ["node", "bot.js"]
