const express = require('express');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info', // Logging level
    format: winston.format.simple(), // Log format
    transports: [
        new winston.transports.File({ filename: 'task_log.txt' }) 
    ]
});

const app = express();
app.use(express.json());

let rateLimitStore = new Map();
let taskQueues = new Map();

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

    if (currentTime - userData.lastRequestTime < 1000) {
        return 1000 - (currentTime - userData.lastRequestTime); 
    }

    if (currentTime - userData.windowStart > 60000) {
        userData.windowStart = currentTime;
        userData.taskCount = 0;
    }

    if (userData.taskCount >= RATE_LIMIT.maxPerMinute) {
        return 60000 - (currentTime - userData.windowStart); 
    }

    userData.lastRequestTime = currentTime;
    userData.taskCount += 1;
    rateLimitStore.set(user_id, userData);

    return 0; 
}


async function task(user_id) {
    const logMessage = `${user_id}-task completed at-${Date.now()}`;
    try {
        logger.info(logMessage); 
    } catch (err) {
    }
}

function processQueue(user_id) {
    const queue = taskQueues.get(user_id) || [];

    if (queue.length > 0) {
        let delay = isRateLimited(user_id);

        if (delay === 0) {
            const taskData = queue.shift();

            task(taskData.user_id).then(() => {
                setTimeout(() => processQueue(user_id), 1000);
            }).catch(err => {
                console.error(`Error executing task for user: ${user_id}`, err);
            });
        } else {
            setTimeout(() => processQueue(user_id), delay);
        }
    } else {
        taskQueues.delete(user_id); 
    }
}

app.post('/api/v1/task', (req, res) => {
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ message: 'User ID is required' });
    }

    if (!isRateLimited(user_id)) {
        let userQueue = taskQueues.get(user_id) || [];
        userQueue.push({ user_id }); 
        taskQueues.set(user_id, userQueue);
        if (userQueue.length === 1) {
            processQueue(user_id); 
        }
        res.status(200).json({ message: 'Task added to queue.' });
    } else {
        res.status(429).json({ message: 'Rate limit exceeded. Try again later.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
