# Use a lightweight Node.js base image
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies (excluding devDependencies like nodemon)
RUN npm ci --omit=dev

# Copy the rest of the application code
# (Assuming static files are already in /public, they will be copied here)
COPY . .

# Change ownership of the directories if needed (optional but good practice for security if running as non-root)
# node:18-alpine includes a 'node' user. We can use it.
# RUN chown -R node:node /usr/src/app 
# USER node

# The application dynamically uses process.env.PORT or 3000
ENV PORT=3000

# Expose the correct port
EXPOSE 3000

# Ensure the app runs
CMD ["npm", "start"]
