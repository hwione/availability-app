const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { createClient } = require('@supabase/supabase-js');
const cron = require('node-cron');
const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Supabase setup
const supabaseUrl = 'https://wtkuplegobzobpyiaojj.supabase.co/'; // Replace with your Supabase URL
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0a3VwbGVnb2J6b2JweWlhb2pqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEwNDc5MjEsImV4cCI6MjA1NjYyMzkyMX0.BFnQ4bl1H8TV5E1D_bTKH1UEh91Po-_hzsHhbqCAEQ4'; // Replace with your Supabase anon key
const supabase = createClient(supabaseUrl, supabaseKey);

// JWT secret key (store this securely in production)
const JWT_SECRET = 'your-secret-key';

// Middleware to verify JWT
const authenticateUser = (req, res, next) => {
    const token = req.cookies.token;
    if (!token) {
        return res.redirect('/');
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.clearCookie('token');
        res.redirect('/');
    }
};

// Schedule a task to reset all users to "Unavailable" at 8 PM every day
cron.schedule('0 20 * * *', async () => {
    const { error } = await supabase
        .from('users')
        .update({ status: 'Unavailable' })
        .neq('status', 'Unavailable'); // Only update if status is not already "Unavailable"

    if (error) {
        console.error('Error resetting user statuses:', error);
    } else {
        console.log('All users have been set to "Unavailable" at 8 PM.');
    }
});

// Routes
app.get('/', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error || !user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.send('Invalid credentials');
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1y' });
    // Set JWT as a cookie
    res.cookie('token', token, { httpOnly: true, maxAge: 365 * 24 * 60 * 60 * 1000 }); // 1 year
    res.redirect(`/dashboard/${user.id}`);
});

app.get('/dashboard/:userId', authenticateUser, async (req, res) => {
    const userId = req.params.userId;
    // Fetch the logged-in user
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (userError || !user) {
        return res.send('User not found');
    }

    // Fetch all available users
    const { data: availableUsers, error: availableUsersError } = await supabase
        .from('users')
        .select('*')
        .eq('status', 'Available');

    if (availableUsersError) {
        return res.send('Error fetching available users');
    }

    res.render('dashboard', { user, availableUsers });
});

app.post('/toggle-status/:userId', authenticateUser, async (req, res) => {
    const userId = req.params.userId;
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

    if (userError || !user) {
        return res.send('User not found');
    }

    const newStatus = user.status === 'Available' ? 'Unavailable' : 'Available';
    const { error } = await supabase
        .from('users')
        .update({ status: newStatus })
        .eq('id', userId);

    if (error) {
        return res.send('Error updating status');
    }

    res.redirect(`/dashboard/${userId}`);
});

app.post('/logout', (req, res) => {
    res.clearCookie('token');
    res.redirect('/');
});

// Start server
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});