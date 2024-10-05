Node.js API cluster with two replicate sets and create a route to handle a simple task. The task has a rate limit of 1 task per second and 20 task per min for each user ID. 
Users will hit the route to process tasks multiple times.
implemented a queueing system to ensure that tasks are processed according to the rate limit for each user ID.
