/* =========================================================
   GROUP 1: IMPORT FIREBASE MODULES
   These modules allow the system to connect to Firebase,
   authenticate users, access Firestore, and monitor changes.
========================================================= */

import {
    initializeApp,
    getApps,
    getApp
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';

import {
    getAuth,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

import {
    getFirestore,
    collection,
    query,
    where,
    onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';


/* =========================================================
   GROUP 2: FIREBASE CONFIGURATION
   This contains the information needed to connect the
   application to the correct Firebase project.
========================================================= */

const firebaseConfig = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'barangay-doc-req.firebaseapp.com',
    projectId: 'barangay-doc-req',
    storageBucket: 'barangay-doc-req.firebasestorage.app',
    messagingSenderId: '176118755540',
    appId: 'YOUR_APP_ID'
};


/* =========================================================
   GROUP 3: INITIALIZE FIREBASE
   Checks whether Firebase has already been initialized.
   If it has, the existing app is reused. Otherwise,
   a new Firebase app is initialized.
========================================================= */

const app = getApps().length
    ? getApp()
    : initializeApp(firebaseConfig);

// Connect Firebase Authentication and Cloud Firestore.
const auth = getAuth(app);
const db = getFirestore(app);


/* =========================================================
   GROUP 4: LISTENER MANAGEMENT
   These variables manage the active Firestore listener
   and the currently authenticated user's ID.
========================================================= */

// Stores the function used to stop the Firestore listener.
let unsubscribe = null;

// Stores the ID of the last authenticated user.
let lastUid = null;


/* =========================================================
   GROUP 5: LOCAL STORAGE MANAGEMENT
   These functions save and retrieve the previous request
   statuses so the system can identify changes.
========================================================= */

// Creates a separate local storage key for each resident.
function storageKey(uid) {
    return `barangay-desktop-request-states:${uid}`;
}

// Retrieves the previously saved request statuses.
function readStates(uid) {
    try {
        return JSON.parse(
            localStorage.getItem(storageKey(uid)) || '{}'
        );
    } catch {
        // Returns an empty object if the saved data is invalid.
        return {};
    }
}


/* =========================================================
   GROUP 6: DISPLAY DESKTOP NOTIFICATIONS
   This function creates a browser notification whenever
   a document request or payment status changes.
========================================================= */

function showAlert(title, message, id) {

    // Checks if the browser supports desktop notifications.
    if (!('Notification' in window)) return;

    // Checks whether the resident has allowed notifications.
    if (Notification.permission !== 'granted') return;

    try {

        // Creates the desktop notification.
        const notification = new Notification(title, {
            body: message,

            // Groups notifications with the same request ID.
            tag: 'barangay-request-' + id,

            // Displays the Barangay system logo.
            icon: '../barangay-logo.png'
        });

        // Defines what happens when the notification is clicked.
        notification.onclick = () => {

            // Focuses the browser window.
            window.focus();

            // Redirects the resident to the notifications page.
            window.location.href = 'notifications.html';

            // Closes the desktop notification.
            notification.close();
        };

    } catch (error) {

        // Displays an error in the browser console.
        console.warn('Unable to display notification:', error);
    }
}


/* =========================================================
   GROUP 7: MONITOR USER AUTHENTICATION
   Detects whether a resident logs in or logs out.
   The system only monitors requests belonging to the
   currently authenticated resident.
========================================================= */

onAuthStateChanged(auth, user => {

    // Stops the previous Firestore listener if one exists.
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }

    // Updates the ID of the currently authenticated user.
    lastUid = user?.uid || null;

    // Stops execution if no resident is logged in.
    if (!user) return;

    // Gets the unique ID of the authenticated resident.
    const uid = user.uid;


    /* =====================================================
       GROUP 8: FILTER AND MONITOR RESIDENT REQUESTS
       Retrieves only the document requests belonging
       to the currently logged-in resident.
    ===================================================== */

    const q = query(
        collection(db, 'requests'),
        where('residentId', '==', uid)
    );

    // Identifies the first database snapshot.
    // This prevents existing records from triggering
    // notifications during the initial loading process.
    let initial = true;


    /* =====================================================
       GROUP 9: REAL-TIME DATABASE LISTENER
       onSnapshot() monitors Firestore for changes.
       It automatically receives updated information
       without requiring the resident to refresh the page.
    ===================================================== */

    unsubscribe = onSnapshot(q, snapshot => {

        // Retrieves the previously saved request statuses.
        const previous = readStates(uid);

        // Creates a copy for storing the latest statuses.
        const next = { ...previous };

        // Stores notifications that need to be displayed.
        const alerts = [];


        /* =================================================
           GROUP 10: CHECK EACH DOCUMENT REQUEST
           Loops through the resident's document requests
           and compares their previous and current statuses.
        ================================================= */

        snapshot.forEach(record => {

            // Gets the information from the current request.
            const data = record.data();

            // Gets the latest document request status.
            const status = String(
                data.status || 'Under Review'
            );

            // Gets the latest payment status.
            const payment = String(
                data.paymentStatus || ''
            );

            // Stores the current status information.
            const current = {
                status,
                payment
            };

            // Retrieves the previous status of this request.
            const old = previous[record.id];


            /* =================================================
               GROUP 11: DETECT STATUS CHANGES
               Compares the previous status with the latest
               status to determine whether an alert is needed.
            ================================================= */

            // Checks whether an old record exists and
            // skips notifications during the initial loading.
            if (old && !initial) {

                // Detects changes in the document request status.
                if (old.status !== status) {

                    alerts.push({
                        title: 'Document Request Update',
                        message: `Your request status is now: ${status}`,
                        id: record.id
                    });

                }

                // Detects changes in the payment status.
                else if (
                    old.payment !== payment && payment
                ) {

                    alerts.push({
                        title: 'Payment Status Update',
                        message: `Your payment status is now: ${payment}`,
                        id: record.id
                    });
                }
            }

            // Updates the latest status for this request.
            next[record.id] = current;

        });


        /* =================================================
           GROUP 12: SAVE UPDATED REQUEST STATUSES
           Saves the latest statuses in the resident's
           browser local storage for future comparison.
        ================================================= */

        try {

            localStorage.setItem(
                storageKey(uid),
                JSON.stringify(next)
            );

        } catch {
            // Prevents a storage error from stopping the system.
        }

        // Marks the initial database loading as complete.
        initial = false;


        /* =================================================
           GROUP 13: DISPLAY GENERATED NOTIFICATIONS
           Displays all detected notifications when the
           resident has granted browser notification access.
        ================================================= */

        if (document.visibilityState === 'visible') {

            alerts.forEach(alert => {
                showAlert(
                    alert.title,
                    alert.message,
                    alert.id
                );
            });

        } else {

            alerts.forEach(alert => {
                showAlert(
                    alert.title,
                    alert.message,
                    alert.id
                );
            });
        }

    }, error => {

        /* =================================================
           GROUP 14: FIRESTORE ERROR HANDLING
           Displays errors if the real-time database listener
           encounters a problem.
        ================================================= */

        console.error(
            'Firestore listener error:',
            error.code,
            error.message
        );

    });

});
