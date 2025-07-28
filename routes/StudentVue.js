// routes/studentvue.js - Defines the API endpoint for fetching data from StudentVue.
/**
 * @route   POST /api/studentvue/login
 * @desc    Logs into StudentVue, fetches all data, and returns it.
 * Credentials are sent in the request body and are never stored.
 * @access  Private (should be protected by user authentication in a real app)
 */
const express = require('express');
const StudentVue = require('studentvue');
const router = express.Router();

router.post('/login', async (req, res) => {
    const { districtUrl, username, password } = req.body;

    if (!districtUrl || !username || !password) {
        return res.status(400).json({ error: 'District URL, username, and password are required.' });
    }

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36',
        };
        const client = await StudentVue.login(districtUrl, { username, password, headers });

        const [messages, calendar, attendance, gradebook, studentInfo, schedule, schoolInfo] = await Promise.all([
            client.getMessages(),
            client.getCalendar(),
            client.getAttendance(),
            client.getGradebook(),
            client.getStudentInfo(),
            client.getSchedule(),
            client.getSchoolInfo()
        ]);

        const studentData = {
            messages,
            calendar,
            attendance,
            gradebook,
            studentInfo,
            schedule,
            schoolInfo
        };

        res.json(studentData);

    } catch (error) {
        console.error("StudentVue login or data fetching failed:", error);
        res.status(500).json({ error: 'Failed to connect to StudentVue. Please check your credentials and district URL.' });
    }
});

module.exports = router;