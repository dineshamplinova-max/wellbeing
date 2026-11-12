import express from 'express';
import { userSignup, userLogin, userLogout, getCurrentUser, deleteUser, updateUser, getUserDetails } from '../controller/user-controller.js';
import { create_journal, getPostsByUsername, update_journal, delete_journal, getJournalById } from '../controller/journal-controller.js';
import { getAnonymousPosts, createAnonymousPost, addComment, likePost, likeComment, getTrendingPosts } from '../controller/anonymous-controller.js';
import { createMood, getMoods, getTodayCheckin, updateTodayCheckin, getMoodSummary } from '../controller/mood-controller.js';
import upload, { postImageUpload } from '../multer/multerConfig.js';
import upload1 from '../multer/multerConfig1.js';
import { requireAuth, requireSelf } from '../middleware/requireAuth.js';
import { loginIpLimiter, loginLimiter, signupLimiter } from '../middleware/rateLimit.js';
import Journal from '../models/journalModel.js';
import User from '../models/userModel.js';

const router = express.Router();
const self = requireSelf();

// Signup, login and logout are the only routes that work without a session.
// Every other route below requires a valid session cookie.
router.post('/signup', signupLimiter, upload.single('profilePicture'), userSignup);
router.post('/login', loginIpLimiter, loginLimiter, userLogin);
router.post('/api/auth/logout', userLogout);
router.get('/api/auth/me', requireAuth, getCurrentUser);
router.get('/:username/getuserdetails', requireAuth, self, getUserDetails);
router.delete('/delete-user/:username', requireAuth, self, deleteUser);
router.patch('/:username/update-user', requireAuth, self, updateUser);

// Anonymous Posts Routes: open to any signed-in user; posts store no author.
router.get('/api/posts', requireAuth, getAnonymousPosts);
router.post('/api/posts/create', requireAuth, postImageUpload.single('image'), createAnonymousPost);
router.get('/api/posts/trending', requireAuth, getTrendingPosts);
router.post('/api/posts/:postId/comments', requireAuth, addComment);
router.post('/api/posts/:postId/like', requireAuth, likePost);
router.post('/api/posts/:postId/comments/:commentId/like', requireAuth, likeComment);

// Journals: the :username in these URLs must be the signed-in user. Reading a
// single journal by id is allowed for its owner, or for any signed-in user when
// the journal is public (Explore links to other authors' journals).
router.post('/:username', requireAuth, self, upload1.single('coverPicture'), create_journal);
router.get('/:username/journals', requireAuth, self, getPostsByUsername);
router.put('/journals/:username/:id', requireAuth, self, update_journal);
router.delete('/journal-delete/:username/:id', requireAuth, self, delete_journal);
router.get('/:username/:id', requireAuth, getJournalById);

// Moods and daily check-ins (signed-in user's own data only; one check-in per
// Asia/Dubai day, editable on that day).
router.get('/api/moods/:username', requireAuth, self, getMoods);
router.post('/api/moods/:username', requireAuth, self, createMood);
router.get('/api/moods/:username/today', requireAuth, self, getTodayCheckin);
router.patch('/api/moods/:username/today', requireAuth, self, updateTodayCheckin);
router.get('/api/moods/:username/summary', requireAuth, self, getMoodSummary);

// Explore Journals route: public journals only, for signed-in users.
router.get('/api/journals/explore', requireAuth, async (req, res) => {
  try {
    const journals = await Journal.find({ isPrivate: false })
      .populate({ path: 'author', select: 'username profilePicture', model: User })
      .sort({ createdAt: -1 })
      .lean();

    const journalsWithAuthor = journals.map(journal => ({
      ...journal,
      authorName: journal.author?.username,
      authorPicture: journal.author?.profilePicture,
      author: undefined // Remove the author object to avoid duplication
    }));

    res.json(journalsWithAuthor);
  } catch (error) {
    console.error('Error in explore journals:', error?.name);
    res.status(500).json({ error: 'Error fetching explore journals' });
  }
});

export default router;
