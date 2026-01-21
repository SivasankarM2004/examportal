const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/exam', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'exam.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Socket.io setup
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});

// Store users
const users = {};
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    // Initialize user data
    socket.userData = {
        id: socket.id,
        type: null,
        name: null,
        authenticated: false
    };
    
    // Admin authentication
    socket.on('admin-auth', (password) => {
        console.log('Admin auth attempt from:', socket.id);
        
        if (password === ADMIN_PASSWORD) {
            socket.userData.type = 'admin';
            socket.userData.authenticated = true;
            socket.userData.name = 'Admin';
            
            socket.emit('auth-success');
            
            // Send current user list
            const studentList = getStudentUsers();
            socket.emit('user-list', studentList);
            
            console.log('Admin authenticated:', socket.id);
        } else {
            socket.emit('auth-failed', 'Invalid password');
            console.log('Admin auth failed:', socket.id);
        }
    });
    
    // Student joins exam
    socket.on('join-exam', (name) => {
        if (!name || name.trim() === '') {
            socket.emit('error', 'Name is required');
            return;
        }
        
        socket.userData.type = 'student';
        socket.userData.name = name.trim();
        socket.userData.authenticated = true;
        
        users[socket.id] = socket.userData;
        
        console.log('Student joined:', name, socket.id);
        
        // Broadcast to all admins
        broadcastToAdmins('user-list', getStudentUsers());
    });
    
    // Get user list (admin request)
    socket.on('get-user-list', () => {
        if (socket.userData.type === 'admin') {
            socket.emit('user-list', getStudentUsers());
        }
    });
    
    // WebRTC signaling
    socket.on('offer', (data) => {
        if (!socket.userData.authenticated) return;
        
        console.log('Offer from', socket.id, 'to', data.userId);
        io.to(data.userId).emit('offer', data);
    });
    
    socket.on('answer', (data) => {
        if (!socket.userData.authenticated) return;
        
        console.log('Answer from', socket.id, 'to', data.adminId);
        io.to(data.adminId).emit('answer', data);
    });
    
    socket.on('ice-candidate', (data) => {
        if (!socket.userData.authenticated) return;
        
        console.log('ICE candidate from', socket.id, 'to', data.target);
        io.to(data.target).emit('ice-candidate', data);
    });
    
    // Student ends exam
    socket.on('end-exam', () => {
        if (socket.userData.type === 'student') {
            console.log('Student ended exam:', socket.userData.name);
            delete users[socket.id];
            broadcastToAdmins('user-list', getStudentUsers());
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id, socket.userData.name);
        
        if (socket.userData.type === 'student') {
            delete users[socket.id];
            broadcastToAdmins('user-list', getStudentUsers());
        }
    });
    
    // Error handling
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Helper functions
function getStudentUsers() {
    const studentUsers = {};
    Object.entries(users).forEach(([id, data]) => {
        if (data.type === 'student' && data.authenticated) {
            studentUsers[id] = data.name;
        }
    });
    return studentUsers;
}

function broadcastToAdmins(event, data) {
    io.sockets.sockets.forEach((client) => {
        if (client.userData.type === 'admin' && client.userData.authenticated) {
            client.emit(event, data);
        }
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`Server is running on port ${PORT}`);
    console.log(`========================================`);
});