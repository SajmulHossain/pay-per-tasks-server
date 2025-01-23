# Pay Per Tasks Backend

This repository contains the backend code for the **Pay Per Tasks** application, developed using **Node.js**, **Express.js**, and **MongoDB**.

## Features
- User authentication with **JWT** and secure cookies.
- Role-based access control (Admin, Buyer, Worker).
- Task management (create, update, delete tasks).
- Payment integration with **Stripe**.
- Submission system for workers.
- Notification system.

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** MongoDB (with Mongoose)
- **Authentication:** JWT, Cookies
- **Payment:** Stripe


## API Endpoints

### Authentication
- `POST /jwt` - Generate and set a JWT token.
- `GET /logout` - Clear the authentication token.

### User Management
- `POST /user/:email` - Add a new user.
- `GET /users/:email` - Get all users (Admin only).
- `DELETE /user/:id` - Delete a user (Admin only).
- `PATCH /user/:email` - Update user role.

### Task Management
- `POST /tasks` - Create a new task (Buyer only).
- `DELETE /task/:id` - Delete a task.
- `GET /tasks/:email` - Get tasks for a specific buyer.
- `GET /task/:id` - Get a specific task.
- `PUT /task/:id` - Update a task (Buyer only).

### Payment Management
- `POST /payment` - Create a Stripe payment intent.
- `POST /payments/:email` - Save payment to the database.
- `GET /payments/:email` - Retrieve user payment history.

### Task Submission
- `POST /submit` - Submit a task (Worker).
- `PATCH /submit/:id` - Approve a submission (Buyer).
- `PATCH /submit/reject/:id` - Reject a submission (Buyer).

### Miscellaneous
- `GET /states` - Get platform statistics (Admin only).
- `GET /coin/:email` - Get user's coin balance.
- `GET /available-tasks` - Get available tasks.


## Contributing
Feel free to submit issues or pull requests to improve the project.

## Author
Developed by Sajmul Hossain.