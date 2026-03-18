// main.js - Entry point for Admin Panel

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { loadSiteSettings } from './settings.js';
import { updateRentalStats } from './mock-data.js';

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyC450kePwL6FdVXUSVli0bEP3DdnQs0qzU",
    authDomain: "psl-esport.firebaseapp.com",
    projectId: "psl-esport",
    storageBucket: "psl-esport.firebasestorage.app",
    messagingSenderId: "225108570173",
    appId: "1:225108570173:web:b6483c02368908f3783a54"
};

// Initialize
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Make db available globally
window.db = db;

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    try {

        
        // Load site settings
        await loadSiteSettings();
        
        // Initialize auth (from auth.js)
        if (window.initAuth) {
            await window.initAuth();
        }
        
        // Update rental stats
        updateRentalStats();
        
        console.log('✅ Admin Panel initialized');
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

// Utility: Fullscreen toggle
window.toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
};
