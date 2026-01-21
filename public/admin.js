// Admin page JavaScript
let socket = null;
let peer = null;
let currentUserId = null;
let isAuthenticated = false;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin page initialized');
    
    // Initialize socket connection
    socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
    });
    
    // Socket connection events
    socket.on('connect', () => {
        console.log('✅ Connected to server');
        showAuthMessage('Connected to server', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('❌ Disconnected from server');
        showAuthMessage('Disconnected from server', 'error');
        resetToLogin();
    });
    
    // Admin authentication responses
    socket.on('auth-success', () => {
        console.log('✅ Admin authentication successful');
        isAuthenticated = true;
        
        // Switch to dashboard view
        document.getElementById('authSection').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        
        showAuthMessage('Authentication successful!', 'success');
    });
    
    socket.on('auth-failed', (message) => {
        console.log('❌ Admin authentication failed');
        showAuthMessage(message || 'Invalid password', 'error');
    });
    
    // User list updates
    socket.on('user-list', (users) => {
        console.log('Received user list:', users);
        if (!isAuthenticated) return;
        
        updateUserList(users);
    });
    
    // WebRTC responses
    socket.on('answer', async (data) => {
        if (!peer || currentUserId !== data.userId) return;
        
        try {
            await peer.setRemoteDescription(data.answer);
            console.log('✅ WebRTC answer received from student');
        } catch (error) {
            console.error('Error setting remote description:', error);
        }
    });
    
    socket.on('ice-candidate', async (data) => {
        if (!peer) return;
        
        try {
            await peer.addIceCandidate(data.candidate);
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    });
    
    // Setup event listeners
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Login button
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', authenticateAdmin);
    }
    
    // Enter key for password field
    const adminPassInput = document.getElementById('adminPass');
    if (adminPassInput) {
        adminPassInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                authenticateAdmin();
            }
        });
    }
}

// Authentication function
function authenticateAdmin() {
    const password = document.getElementById('adminPass').value;
    if (!password) {
        showAuthMessage('Please enter password', 'error');
        return;
    }
    
    console.log('Attempting admin authentication...');
    socket.emit('admin-auth', password);
}

// Update user list display
function updateUserList(users) {
    const usersList = document.getElementById('users');
    const noUsers = document.getElementById('noUsers');
    
    if (!usersList || !noUsers) return;
    
    // Clear current list
    usersList.innerHTML = '';
    
    const userCount = Object.keys(users).length;
    
    if (userCount === 0) {
        noUsers.style.display = 'block';
        updateStatus('No active students to monitor');
        cleanupPeerConnection();
        return;
    }
    
    noUsers.style.display = 'none';
    
    // Add each user to the list
    Object.entries(users).forEach(([id, name]) => {
        const li = document.createElement('li');
        
        // Highlight if currently monitoring this user
        const isCurrent = id === currentUserId;
        
        li.innerHTML = `
            <strong>${name}</strong>
            <div class="student-info">ID: ${id.substring(0, 8)}...</div>
            ${isCurrent ? '<div class="student-info">🔴 Currently Monitoring</div>' : ''}
        `;
        
        li.style.background = isCurrent ? '#d1ecf1' : '#f8f9fa';
        li.style.borderColor = isCurrent ? '#bee5eb' : '#e9ecef';
        
        li.addEventListener('click', () => monitorUser(id, name));
        
        usersList.appendChild(li);
    });
}

// Monitor a specific user
async function monitorUser(userId, userName) {
    if (currentUserId === userId && peer) {
        console.log('Already monitoring this user');
        return;
    }
    
    console.log(`Starting to monitor user: ${userName} (${userId})`);
    
    // Cleanup existing connection
    cleanupPeerConnection();
    
    currentUserId = userId;
    updateStatus(`Connecting to ${userName}...`);
    
    try {
        // Create new peer connection
        peer = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        
        // Handle incoming video stream
        peer.ontrack = (event) => {
            console.log('✅ Received video stream from student');
            const video = document.getElementById('video');
            if (video) {
                video.srcObject = event.streams[0];
                updateStatus(`Live: ${userName}`);
                
                // Auto-play video
                video.play().catch(e => {
                    console.warn('Video play failed:', e);
                    updateStatus(`${userName} (click play to start)`);
                });
            }
        };
        
        // Connection state monitoring
        peer.onconnectionstatechange = () => {
            console.log('WebRTC connection state:', peer.connectionState);
            
            if (peer.connectionState === 'connected') {
                console.log('✅ Successfully connected to student');
            } else if (peer.connectionState === 'disconnected' || 
                       peer.connectionState === 'failed') {
                console.log('❌ Connection lost with student');
                updateStatus(`Disconnected from ${userName}`);
                
                // Attempt reconnection after delay
                setTimeout(() => {
                    if (currentUserId === userId) {
                        console.log('Attempting reconnection...');
                        monitorUser(userId, userName);
                    }
                }, 3000);
            }
        };
        
        // Send ICE candidates
        peer.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', {
                    target: userId,
                    candidate: event.candidate
                });
            }
        };
        
        // Create and send offer
        const offer = await peer.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true
        });
        
        await peer.setLocalDescription(offer);
        
        socket.emit('offer', {
            adminId: socket.id,
            userId: userId,
            offer: offer
        });
        
        console.log('✅ WebRTC offer sent to student');
        
        // Update user list to show current monitoring
        socket.emit('get-user-list');
        
    } catch (error) {
        console.error('Error starting monitoring:', error);
        updateStatus(`Failed to connect to ${userName}`);
        cleanupPeerConnection();
    }
}

// Cleanup peer connection
function cleanupPeerConnection() {
    if (peer) {
        // Stop video tracks
        const video = document.getElementById('video');
        if (video && video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
        
        // Close peer connection
        peer.close();
        peer = null;
    }
    
    currentUserId = null;
}

// Reset to login screen
function resetToLogin() {
    isAuthenticated = false;
    document.getElementById('authSection').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
    cleanupPeerConnection();
}

// Update status message
function updateStatus(message) {
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

// Show authentication message
function showAuthMessage(message, type) {
    const authMessage = document.getElementById('authMessage');
    if (authMessage) {
        authMessage.textContent = message;
        authMessage.className = type;
    }
}

// Request user list
function requestUserList() {
    if (socket && isAuthenticated) {
        socket.emit('get-user-list');
    }
}

// Auto-refresh user list every 10 seconds
setInterval(() => {
    if (isAuthenticated) {
        requestUserList();
    }
}, 10000);