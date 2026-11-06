# ExamFlow — Online Examination System

Node.js + Express online examination portal.

## Features
- Student registration and login (bcrypt password hashing)
- Administrator and student roles
- Admin dashboard and exam management
- Timed multiple-choice exams
- Automatic scoring, answer review, and result history
- Responsive interface
- Seeded JavaScript Fundamentals sample exam

## Run locally (Windows)
1. Extract this ZIP.
2. Open CMD in the folder containing `package.json`.
3. Run `npm install`.
4. Run `npm start`.
5. Open `http://localhost:3000`.

Local demo administrator:
- Email: `admin@exam.com`
- Password: `Admin@12345`

Students can register using Create account.

## Deploy to Render
Create a new **Web Service** from the GitHub repository containing these files.

Use:
- Language: Node
- Branch: `main`
- Root Directory: leave blank if `package.json` is in the repository root
- Build Command: `npm install`
- Start Command: `npm start`
- Node version: pinned to Node 22 by `.node-version` and `engines` in `package.json`

Add these Environment Variables in Render:
- `SESSION_SECRET`: a long random secret value
- `ADMIN_EMAIL`: the administrator email to create on first startup
- `ADMIN_PASSWORD`: a strong password of at least 8 characters

The admin account is created only when the data store does not already contain an admin. Set the admin variables before the first deployment. If the default local demo admin was already created in a persistent data store, changing these variables will not change that existing account.

## Data persistence warning
The application stores users, exams, and attempts in `data/db.json` by default. Render's local filesystem is ephemeral on free web services, so data can be lost on redeploy/restart. For reliable public use, connect a persistent disk or migrate the JSON storage to PostgreSQL. The default in-memory Express session store is also intended for demos, not production multi-instance use.

## Project structure
```
.
├── .node-version
├── .gitignore
├── package.json
├── server.js
├── data/
└── public/
    ├── app.js
    ├── index.html
    └── style.css
```
