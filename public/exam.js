let socket = null;
let stream = null;
let peer = null;
let warningCount = 0;
const MAX_WARNINGS = 3;
let isExamActive = false;
let examStarted = false;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Exam page initialized');
    
    // Get the socket from window object
    socket = window.socket;
    
    if (!socket) {
        console.error('Socket not available');
        showStatus('error', 'Connection Error', 'Cannot connect to server. Please refresh.');
        return;
    }
    
    // Setup Enter key for name field
    const nameInput = document.getElementById('name');
    if (nameInput) {
        nameInput.addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                startExam();
            }
        });
    }
    
    // Setup event listeners
    setupEventListeners();
});

// Start exam function - ENFORCES SCREEN & MICROPHONE
window.startExam = async function() {
    const name = document.getElementById('name').value.trim();
    
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    console.log('Starting exam for:', name);
    
    // Disable start button
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Requesting Permissions...';
    }
    
    showStatus('info', 'Permissions Required', 
        'You MUST allow ENTIRE SCREEN sharing AND microphone access. Both are COMPULSORY.');
    
    try {
        // STEP 1: Request screen sharing (ENTIRE SCREEN ONLY)
        console.log('Requesting screen sharing...');
        stream = await requestScreenShare();
        
        if (!stream) {
            throw new Error('Screen sharing not granted');
        }
        
        // STEP 2: Request microphone access
        console.log('Requesting microphone...');
        const audioStream = await requestMicrophone();
        
        if (!audioStream) {
            throw new Error('Microphone access not granted');
        }
        
        // Add microphone track to screen sharing stream
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) {
            stream.addTrack(audioTrack);
        }
        
        // STEP 3: Verify we have both video and audio
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        
        if (videoTracks.length === 0) {
            throw new Error('No video track available');
        }
        
        if (audioTracks.length === 0) {
            throw new Error('No audio track available');
        }
        
        // STEP 4: Check if user selected ENTIRE SCREEN - IMMEDIATE TERMINATION IF NOT
        const videoTrack = videoTracks[0];
        const settings = videoTrack.getSettings();
        
        if (settings.displaySurface && settings.displaySurface !== 'monitor') {
            // IMMEDIATE TERMINATION - Not entire screen
            const errorMsg = '❌ EXAM TERMINATED\n\n' +
                  'You MUST share your ENTIRE SCREEN!\n\n' +
                  'You selected: ' + settings.displaySurface + '\n' +
                  'Entire Screen is COMPULSORY for the exam.\n\n' +
                  'Please start again and select "Entire Screen" when prompted.';
            
            alert(errorMsg);
            
            // Stop the stream immediately
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            resetUI();
            return;
        }
        
        console.log('✅ Permissions granted: Entire Screen + Microphone');
        
        // STEP 5: Join exam session
        socket.emit('join-exam', name);
        
        // STEP 6: Update UI
        showStatus('success', 'Exam Started', 
            '✅ Your ENTIRE SCREEN and microphone are being monitored. Both are COMPULSORY.');
        
        // Show warning panel
        const warningPanel = document.getElementById('warningStatus');
        if (warningPanel) {
            warningPanel.style.display = 'block';
            // Update warning message to be clear about what's strict
            const warningMsg = document.querySelector('#warningStatus .status-message');
            if (warningMsg) {
                warningMsg.innerHTML = `
                    <p><strong>COMPULSORY (Immediate Termination):</strong></p>
                    <ul>
                        <li>Entire Screen Sharing</li>
                        <li>Microphone Access</li>
                    </ul>
                    <p><strong>Warnings (${MAX_WARNINGS} allowed):</strong></p>
                    <ul>
                        <li>Tab/Window Switching</li>
                        <li>Browser Minimization</li>
                        <li>Other rule violations</li>
                    </ul>
                `;
            }
        }
        
        // Show exam active panel
        const examActive = document.getElementById('examActive');
        if (examActive) examActive.style.display = 'block';
        
        // Hide start button
        if (startBtn) startBtn.style.display = 'none';
        
        isExamActive = true;
        examStarted = true;
        
        // STEP 7: Monitor screen sharing - TERMINATE IMMEDIATELY IF STOPPED
        monitorScreenSharing();
        
        // STEP 8: Request fullscreen
        await enterFullscreen();
        
        // STEP 9: Setup WebRTC for admin monitoring
        setupWebRTC();
        
        // STEP 10: Start periodic permission checks
        startPermissionChecks();
        
    } catch (error) {
        console.error('Error starting exam:', error);
        
        if (error.message === 'Microphone access not granted') {
            alert('❌ EXAM CANNOT START\n\n' +
                  'Microphone access is COMPULSORY and was not granted.\n\n' +
                  'You must allow microphone access to start the exam.');
        } else if (error.name === 'NotAllowedError') {
            alert('❌ PERMISSION DENIED\n\n' +
                  'You MUST allow:\n' +
                  '1. ENTIRE SCREEN sharing (COMPULSORY)\n' +
                  '2. Microphone access (COMPULSORY)\n\n' +
                  'Without these permissions, you cannot take the exam.');
        } else if (error.name === 'NotFoundError') {
            alert('❌ DEVICE NOT FOUND\n\n' +
                  'Please ensure you have:\n' +
                  '1. A screen to share (COMPULSORY)\n' +
                  '2. A working microphone (COMPULSORY)\n\n' +
                  'Both are required to take the exam.');
        } else {
            alert('❌ Error: ' + error.message);
        }
        
        // Reset UI
        resetUI();
    }
};

// Request screen sharing with ENTIRE SCREEN enforcement
async function requestScreenShare() {
    try {
        const displayMediaOptions = {
            video: {
                displaySurface: 'monitor', // Force entire screen preference
            },
            audio: true,
            systemAudio: 'include',
            preferCurrentTab: false
        };
        
        let screenStream;
        
        // Try to get entire screen
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
        } catch (e) {
            // Fallback
            screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true, 
                audio: true 
            });
        }
        
        return screenStream;
        
    } catch (error) {
        console.error('Screen share error:', error);
        throw error;
    }
}

// Request microphone access - MUST BE GRANTED
async function requestMicrophone() {
    try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 2
            }
        });
        
        // Test if microphone is actually working
        const audioTrack = audioStream.getAudioTracks()[0];
        if (!audioTrack) {
            throw new Error('No microphone track found');
        }
        
        // Test if we can get audio levels (microphone is active)
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(audioStream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        
        // Wait a moment to ensure microphone is active
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return audioStream;
        
    } catch (error) {
        console.error('Microphone error:', error);
        
        if (error.name === 'NotAllowedError') {
            throw new Error('Microphone access not granted');
        } else if (error.name === 'NotFoundError') {
            throw new Error('No microphone found');
        } else {
            throw error;
        }
    }
}

// Setup WebRTC for admin monitoring
function setupWebRTC() {
    socket.on('offer', async (data) => {
        if (!isExamActive || !stream) return;
        
        console.log('Received WebRTC offer from admin');
        
        try {
            // Close existing peer connection
            if (peer) {
                peer.close();
            }
            
            // Create new peer connection
            peer = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' }
                ]
            });
            
            // Add ALL tracks from stream (screen + microphone)
            stream.getTracks().forEach(track => {
                peer.addTrack(track, stream);
            });
            
            // ICE candidate handling
            peer.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', {
                        target: data.adminId,
                        candidate: event.candidate
                    });
                }
            };
            
            // Connection monitoring
            peer.onconnectionstatechange = () => {
                if (peer.connectionState === 'disconnected' || 
                    peer.connectionState === 'failed') {
                    console.log('WebRTC connection lost with admin');
                }
            };
            
            // Set remote description and create answer
            await peer.setRemoteDescription(data.offer);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            
            // Send answer back to admin
            socket.emit('answer', {
                userId: socket.id,
                adminId: data.adminId,
                answer: answer
            });
            
            console.log('✅ WebRTC connection established with admin');
            
        } catch (error) {
            console.error('WebRTC error:', error);
        }
    });
    
    // Handle ICE candidates from admin
    socket.on('ice-candidate', async (data) => {
        if (!peer) return;
        
        try {
            await peer.addIceCandidate(data.candidate);
        } catch (error) {
            console.error('Error adding ICE candidate:', error);
        }
    });
}

// Monitor screen sharing - TERMINATE IMMEDIATELY IF STOPPED
function monitorScreenSharing() {
    if (!stream) return;
    
    // Monitor ALL tracks
    stream.getTracks().forEach(track => {
        track.onended = () => {
            if (isExamActive) {
                console.log(`${track.kind} track stopped. Terminating exam...`);
                
                // IMMEDIATE TERMINATION - NO WARNING
                const violationType = track.kind === 'video' ? 'Screen Sharing' : 'Microphone';
                alert(`❌ EXAM TERMINATED\n\n` +
                      `Your ${violationType} was stopped.\n` +
                      `This is a COMPULSORY requirement violation.\n` +
                      `The exam has been terminated.`);
                endExam();
            }
        };
        
        // Also monitor if track is muted/disabled - IMMEDIATE TERMINATION
        const originalEnabled = track.enabled;
        Object.defineProperty(track, 'enabled', {
            get() {
                return originalEnabled;
            },
            set(value) {
                if (!value && isExamActive) {
                    console.log(`${track.kind} track disabled. Terminating exam...`);
                    const violationType = track.kind === 'video' ? 'Screen Sharing' : 'Microphone';
                    alert(`❌ EXAM TERMINATED\n\n` +
                          `Your ${violationType} was disabled.\n` +
                          `This is a COMPULSORY requirement violation.\n` +
                          `The exam has been terminated.`);
                    endExam();
                }
                originalEnabled = value;
            }
        });
    });
}

// Start periodic permission checks - STRICT for screen and microphone
function startPermissionChecks() {
    // Check permissions every 3 seconds (more frequent)
    const checkInterval = setInterval(() => {
        if (!isExamActive || !stream) {
            clearInterval(checkInterval);
            return;
        }
        
        const videoTracks = stream.getVideoTracks();
        const audioTracks = stream.getAudioTracks();
        
        // Check screen sharing - IMMEDIATE TERMINATION IF LOST
        if (videoTracks.length === 0 || 
            !videoTracks[0].enabled || 
            videoTracks[0].readyState !== 'live') {
            console.log('Screen sharing lost. Terminating exam...');
            alert('❌ EXAM TERMINATED\n\n' +
                  'Screen sharing was interrupted.\n' +
                  'Entire Screen sharing is COMPULSORY for the exam.');
            endExam();
            clearInterval(checkInterval);
            return;
        }
        
        // Check microphone - IMMEDIATE TERMINATION IF LOST
        if (audioTracks.length === 0 || 
            !audioTracks[0].enabled || 
            audioTracks[0].readyState !== 'live') {
            console.log('Microphone lost. Terminating exam...');
            alert('❌ EXAM TERMINATED\n\n' +
                  'Microphone access was interrupted.\n' +
                  'Microphone is COMPULSORY for audio monitoring during the exam.');
            endExam();
            clearInterval(checkInterval);
            return;
        }
        
        // Verify screen is still entire screen (re-check periodically)
        const videoTrack = videoTracks[0];
        const settings = videoTrack.getSettings();
        
        if (settings.displaySurface && settings.displaySurface !== 'monitor') {
            console.log('Screen changed from entire screen. Terminating exam...');
            alert('❌ EXAM TERMINATED\n\n' +
                  'You switched from Entire Screen sharing.\n' +
                  'Entire Screen is COMPULSORY throughout the exam.\n\n' +
                  'Current sharing: ' + settings.displaySurface);
            endExam();
            clearInterval(checkInterval);
            return;
        }
        
    }, 3000); // Check every 3 seconds
}

// Fullscreen handling
async function enterFullscreen() {
    try {
        if (!document.fullscreenElement) {
            await document.documentElement.requestFullscreen();
        }
    } catch (err) {
        console.warn('Fullscreen error:', err);
        // This is a warning, not termination
    }
}

// Setup event listeners
function setupEventListeners() {
    // Socket connection events
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        if (isExamActive) {
            alert('❌ EXAM TERMINATED\n\nLost connection to server.');
            endExam();
        }
    });
    
    // Page visibility monitoring - WARNING ONLY
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isExamActive) {
            warningCount++;
            updateWarningCount();
            
            if (warningCount <= MAX_WARNINGS) {
                alert(`⚠️ TAB SWITCH DETECTED\n\nWarning ${warningCount}/${MAX_WARNINGS}\n` +
                      'Do not switch tabs during the exam.\n\n' +
                      'Note: Entire Screen and Microphone are COMPULSORY and will terminate exam if lost.');
                
                if (warningCount >= MAX_WARNINGS) {
                    alert('❌ EXAM TERMINATED\n\nMaximum tab switching warnings reached.');
                    endExam();
                }
            }
        }
    });
    
    // Window blur monitoring - WARNING ONLY
    window.addEventListener('blur', () => {
        if (isExamActive && !document.hidden) {
            warningCount++;
            updateWarningCount();
            
            if (warningCount <= MAX_WARNINGS) {
                alert(`⚠️ WINDOW SWITCH DETECTED\n\nWarning ${warningCount}/${MAX_WARNINGS}\n` +
                      'Stay focused on the exam window.\n\n' +
                      'Note: Entire Screen and Microphone are COMPULSORY and will terminate exam if lost.');
                
                if (warningCount >= MAX_WARNINGS) {
                    alert('❌ EXAM TERMINATED\n\nMaximum focus warnings reached.');
                    endExam();
                }
            }
        }
    });
    
    // Fullscreen monitoring - WARNING ONLY
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement && isExamActive) {
            warningCount++;
            updateWarningCount();
            
            if (warningCount <= MAX_WARNINGS) {
                alert(`⚠️ FULLSCREEN EXITED\n\nWarning ${warningCount}/${MAX_WARNINGS}\n` +
                      'Returning to fullscreen mode...');
                
                if (warningCount < MAX_WARNINGS) {
                    enterFullscreen();
                }
                
                if (warningCount >= MAX_WARNINGS) {
                    alert('❌ EXAM TERMINATED\n\nMaximum fullscreen warnings reached.');
                    endExam();
                }
            }
        }
    });
}

// Update warning count display
function updateWarningCount() {
    const warningCountSpan = document.getElementById('warningCount');
    if (warningCountSpan) {
        warningCountSpan.textContent = `${warningCount}/${MAX_WARNINGS}`;
        
        const warningPanel = document.getElementById('warningStatus');
        if (warningPanel) {
            if (warningCount >= MAX_WARNINGS - 1) {
                warningPanel.className = 'danger';
            } else if (warningCount > 0) {
                warningPanel.className = 'warning';
            }
        }
    }
}

// End exam function - IMMEDIATE TERMINATION
window.endExam = function() {
    if (!isExamActive) return;
    
    console.log('Terminating exam...');
    isExamActive = false;
    
    // Stop screen sharing and microphone IMMEDIATELY
    if (stream) {
        stream.getTracks().forEach(track => {
            track.stop(); // Force stop all tracks
        });
        stream = null;
    }
    
    // Close WebRTC connection
    if (peer) {
        peer.close();
        peer = null;
    }
    
    // Notify server
    socket.emit('end-exam');
    
    // Exit fullscreen
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
    
    // Clear all intervals
    const maxIntervalId = window.setInterval(() => {}, 0);
    for (let i = 1; i < maxIntervalId; i++) {
        window.clearInterval(i);
    }
    
    // Force page reload after 2 seconds
    setTimeout(() => {
        location.reload();
    }, 2000);
};

// Reset UI
function resetUI() {
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fas fa-play"></i> Start Exam';
        startBtn.style.display = 'block';
    }
    
    const examActive = document.getElementById('examActive');
    if (examActive) examActive.style.display = 'none';
    
    const warningPanel = document.getElementById('warningStatus');
    if (warningPanel) {
        warningPanel.style.display = 'none';
        warningPanel.className = 'warning'; // Reset to default
    }
    
    const statusDiv = document.getElementById('status');
    if (statusDiv) statusDiv.style.display = 'none';
    
    warningCount = 0;
}

// Show status message
function showStatus(type, title, message) {
    const statusDiv = document.getElementById('status');
    const statusTitle = document.getElementById('statusTitle');
    const statusMessage = document.getElementById('statusMessage');
    
    if (statusDiv && statusTitle && statusMessage) {
        statusTitle.textContent = title;
        statusMessage.textContent = message;
        statusDiv.className = type === 'error' ? 'danger' : type;
        statusDiv.style.display = 'block';
    }
}

// Handle page unload - WARNING ONLY
window.addEventListener('beforeunload', (e) => {
    if (isExamActive) {
        e.preventDefault();
        e.returnValue = '❌ You are in an active exam. Leaving will terminate the exam.';
        return e.returnValue;
    }
});

// Prevent right-click, copy, etc. during exam - WARNING ONLY
document.addEventListener('contextmenu', (e) => {
    if (isExamActive) {
        e.preventDefault();
        warningCount++;
        updateWarningCount();
        
        if (warningCount <= MAX_WARNINGS) {
            alert(`⚠️ ACTION BLOCKED\n\nWarning ${warningCount}/${MAX_WARNINGS}\n` +
                  'Right-click is disabled during exam.');
            
            if (warningCount >= MAX_WARNINGS) {
                alert('❌ EXAM TERMINATED\n\nMaximum violation warnings reached.');
                endExam();
            }
        }
    }
});

// Prevent keyboard shortcuts during exam - WARNING ONLY
document.addEventListener('keydown', (e) => {
    if (!isExamActive) return;
    
    // Block F12 (DevTools)
    if (e.key === 'F12') {
        e.preventDefault();
        warningCount++;
        updateWarningCount();
        
        if (warningCount >= MAX_WARNINGS) {
            alert('❌ EXAM TERMINATED\n\nAttempt to open developer tools detected.');
            endExam();
        }
        return false;
    }
    
    // Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C
    if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key)) {
        e.preventDefault();
        warningCount++;
        updateWarningCount();
        
        if (warningCount >= MAX_WARNINGS) {
            alert('❌ EXAM TERMINATED\n\nAttempt to open developer tools detected.');
            endExam();
        }
        return false;
    }
    
    // Block print screen - WARNING ONLY
    if (e.key === 'PrintScreen') {
        e.preventDefault();
        warningCount++;
        updateWarningCount();
        
        if (warningCount <= MAX_WARNINGS) {
            alert(`⚠️ Screenshots are disabled during exam.\n\nWarning ${warningCount}/${MAX_WARNINGS}`);
            
            if (warningCount >= MAX_WARNINGS) {
                alert('❌ EXAM TERMINATED\n\nMaximum screenshot attempt warnings reached.');
                endExam();
            }
        }
        return false;
    }
});