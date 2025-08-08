// backend/services/studentVueService.js
const StudentVue = require('studentvue.js');
const { getDB } = require('../db');
const { ObjectId } = require('mongodb');

async function loginToStudentVue({ districtUrl, username, password }) {
  try {
    const client = await StudentVue.login(districtUrl, {
      username,
      password,
    });
    return client;
  } catch (error) {
    console.error('StudentVue login failed:', error.message);
    throw new Error('Invalid StudentVue credentials');
  }
}

async function validateAndSaveCredentials(userId, { districtUrl, username, password }) {
  const client = await loginToStudentVue({ districtUrl, username, password });

  const db = getDB();
  await db.collection('user_applications').updateOne(
    { userId },
    {
      $set: {
        'studentvue.districtUrl': districtUrl,
        'studentvue.username': username,
        'studentvue.password': password,
      },
    },
    { upsert: true }
  );

  return true;
}

async function getStoredCredentials(userId) {
  const db = getDB();
  const user = await db.collection('user_applications').findOne({ userId });

  if (!user?.studentvue) {
    throw new Error('StudentVue credentials not found');
  }

  return user.studentvue;
}

// Wrapper for client calls
async function withClient(userId, callback) {
  const creds = await getStoredCredentials(userId);
  const client = await loginToStudentVue(creds);
  return callback(client);
}

// StudentVue functions
async function getMessages(userId) {
  return withClient(userId, client => client.getMessages());
}

async function getAttendance(userId) {
  return withClient(userId, client => client.getAttendance());
}

async function getGradebook(userId, reportPeriod = null) {
  return withClient(userId, client => client.getGradebook(reportPeriod));
}

async function getSchedule(userId, termIndex = null) {
  return withClient(userId, client => client.getSchedule(termIndex));
}

async function getStudentInfo(userId) {
  return withClient(userId, client => client.getStudentInfo());
}

module.exports = {
  validateAndSaveCredentials,
  getMessages,
  getAttendance,
  getGradebook,
  getSchedule,
  getStudentInfo,
};
