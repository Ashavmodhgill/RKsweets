
const API_BASE_URL = 'http://localhost:3003/api/v1';

async function handleSignup(name, email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: name,
                email: email,
                password: password
            })
        });

        const data = await response.json();

        if (data.sucess) {
            alert('Signup successful! Please login.');
            // Redirect to login page
            window.location.href = 'login.html';
        } else {
            alert('Signup failed: ' + data.message);
        }

        return data;
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    }
}

// Login function
async function handleLogin(email, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const data = await response.json();

        if (data.sucess) {
            // Save token to localStorage
            localStorage.setItem('authToken', data.data);
            alert('Login successful!');
            // Redirect to home page
            window.location.href = 'index.html';
        } else {
            alert('Login failed: ' + data.message);
        }

        return data;
    } catch (error) {
        console.error('Error:', error);
        alert('Error: ' + error.message);
    }
}

// Logout function
function handleLogout() {
    localStorage.removeItem('authToken');
    window.location.href = 'login.html';
}

// Check if user is logged in
function isUserLoggedIn() {
    return localStorage.getItem('authToken') !== null;
}

// Get auth token
function getAuthToken() {
    return localStorage.getItem('authToken');
}
