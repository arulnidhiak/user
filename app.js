const express = require('express');
// const fs = require('fs');
// const path = require('path');
const winston = require('winston');

// Create a Winston logger
const logger = winston.createLogger({
    level: 'info', // Logging level
    format: winston.format.simple(), // Log format
    transports: [
        new winston.transports.File({ filename: 'task_log.txt' })  // Log to file
    ]
});


// Initialize Express App
const app = express();
app.use(express.json()); // Ensure this is included to parse JSON requests

// In-memory data stores
let rateLimitStore = new Map();
let taskQueues = new Map();

// Rate limiting logic (1 task per second, max 20 tasks per minute)
const RATE_LIMIT = {
    maxPerSecond: 1,
    maxPerMinute: 20
};

function isRateLimited(user_id) {
    const currentTime = Date.now();
    let userData = rateLimitStore.get(user_id) || {
        lastRequestTime: 0,
        taskCount: 0,
        windowStart: currentTime
    };

    // Rate limit checks (1 task per second)
    if (currentTime - userData.lastRequestTime < 1000) {
        return 1000 - (currentTime - userData.lastRequestTime);  // Return delay in ms to retry
    }

    // Reset rate limiting window after 1 minute
    if (currentTime - userData.windowStart > 60000) {
        userData.windowStart = currentTime;
        userData.taskCount = 0;
    }

    // Check for max 20 tasks per minute
    if (userData.taskCount >= RATE_LIMIT.maxPerMinute) {
        return 60000 - (currentTime - userData.windowStart);  // Return delay in ms to retry
    }

    // Update the user's rate limit data
    userData.lastRequestTime = currentTime;
    userData.taskCount += 1;
    rateLimitStore.set(user_id, userData);

    return 0;  // No rate limit, proceed immediately
}


// Task processing logic
async function task(user_id) {
    const logMessage = `${user_id}-task completed at-${Date.now()}`;
    try {
        logger.info(logMessage);  // Use Winston to log the message
    } catch (err) {
    }
}

// Process tasks for each user
function processQueue(user_id) {
    const queue = taskQueues.get(user_id) || [];

    if (queue.length > 0) {
        // Get the rate limit delay
        let delay = isRateLimited(user_id);

        if (delay === 0) {
            // No rate limit, execute the task
            const taskData = queue.shift();

            task(taskData.user_id).then(() => {
                setTimeout(() => processQueue(user_id), 1000);  // Process next task after 1 second
            }).catch(err => {
                console.error(`Error executing task for user: ${user_id}`, err);
            });
        } else {
            // Rate-limited, retry after the delay
            setTimeout(() => processQueue(user_id), delay);
        }
    } else {
        taskQueues.delete(user_id);  // Clear the queue if it's empty
    }
}




// POST route to add task to queue
app.post('/api/v1/task', (req, res) => {
    const { user_id } = req.body; // Ensure user_id is extracted from the request body

    if (!user_id) {
        return res.status(400).json({ message: 'User ID is required' });
    }

    if (!isRateLimited(user_id)) {
        // Add task to queue
        let userQueue = taskQueues.get(user_id) || [];
        userQueue.push({ user_id });  // Ensure user_id is passed when queuing
        taskQueues.set(user_id, userQueue);

        // Start processing the queue if not already processing
        if (userQueue.length === 1) {
            processQueue(user_id);  // Pass user_id to processQueue
        }

        res.status(200).json({ message: 'Task added to queue.' });
    } else {
        res.status(429).json({ message: 'Rate limit exceeded. Try again later.' });
    }
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
