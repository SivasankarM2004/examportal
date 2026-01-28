# Secure Exam Portal

A robust online examination system featuring real-time proctoring, secure screen sharing, and anti-cheating mechanisms. Built with Node.js, Socket.io, and WebRTC.

![Project Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 📋 Table of Contents
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Usage](#-usage)
- [Project Structure](#-project-structure)
- [Security Mechanisms](#-security-mechanisms)

## ✨ Features

### 🎓 Student Portal
- **Secure Authentication**: Simple name-based entry for students.
- **Strict Monitoring**: Compulsory fullscreen and entire-screen sharing enforcement.
- **Real-time Proctoring**: Live video and audio streaming to admin.
- **Anti-Cheat System**:
  - Detects tab switching and window blurring.
  - Blocks right-click context menus.
  - Prevents common keyboard shortcuts (F12, Ctrl+Shift+I/J/C).
  - **Immediate Termination** protocols for critical violations (stopping screen share, microphone loss).
  - **Warning System** for minor violations (3 strikes policy).

### 🛡️ Admin Portal
- **Dashboard**: Real-time list of active students.
- **Live Monitoring**: One-click connect to view any student's screen and hear their audio.
- **Authentication**: Password-protected admin access.
- **Status Updates**: Visual indicators for monitoring status and connection health.

## 🛠 Tech Stack

- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.io (Signaling & Events)
- **Media Streaming**: WebRTC (Peer-to-Peer Video/Audio)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3

## ⚙️ Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- Modern web browser (Chrome or Firefox recommended for best WebRTC support)

## 🚀 Installation

1.  **Clone the repository** (or download source):
    ```bash
    git clone <repository-url>
    cd examportal
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

## 📖 Usage

### 1. Start the Server
```bash
npm start
# OR for development with auto-reload
npm run dev
```
Server runs on `http://localhost:3000` by default.

### 2. Student Access
- Open `http://localhost:3000` and select **Student Portal**.
- Enter your name and click **Start Exam**.
- **Permissions**: You MUST allow:
  - **Entire Screen** sharing (application winds/tabs are rejected).
  - **Microphone** access.
- The exam environment will lock into fullscreen.

### 3. Admin Monitoring
- Open `http://localhost:3000` and select **Admin Portal** (or go to `/admin`).
- Login with the password (default: `admin123`).
- You will see a list of active students.
- Click on a student's name to view their live screen and audio feed.

## 📂 Project Structure

```
examportal/
├── public/                 # Frontend static files
│   ├── admin.html          # Admin dashboard UI
│   ├── admin.js            # Admin client logic (Socket/WebRTC)
│   ├── exam.html           # Student exam UI
│   ├── exam.js             # Student client logic (Anti-cheat/WebRTC)
│   ├── index.html          # Landing page
│   └── ...                 # Assets
├── server.js               # Main Express server & Socket.io logic
├── package.json            # Dependencies and scripts
└── Procfile                # Heroku deployment config
```

## 🔒 Security & Anti-Cheat Mechanisms

The platform employs a multi-layered security approach:

1.  **Browser & OS Level**:
    - **FullScreen API**: Forces immersion.
    - **Page Visibility API**: Detects when the user switches tabs or minimizes the browser.
    - **WebRTC constraints**: Enforces `displaySurface: 'monitor'` to ensure the *entire* desktop is shared, preventing users from hiding cheating tools in other windows.
    
2.  **Application Level**:
    - **Socket Heartbeats**: Maintains connection state.
    - **Event Listeners**: Captures restricted keystrokes and mouse actions.
    - **Automatic Termination**: The server and client logic conspire to end the session immediately if critical monitoring streams (video/audio) are cut.

## ⚠️ Configuration

You can configure the following environment variables:
- `PORT`: Server port (default: 3000)
- `ADMIN_PASSWORD`: Password for admin access (default: `admin123`)

Create a `.env` file or set them in your environment.

---
© 2024 Secure Exam Portal
