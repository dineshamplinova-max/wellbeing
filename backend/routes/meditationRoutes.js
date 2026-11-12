import express from 'express';
import MeditationSession from '../models/MeditationSession.js';
import { requireAuth, requireSelf } from '../middleware/requireAuth.js';

const router = express.Router();

const MAX_DURATION_MINUTES = 240;
const MAX_TYPE_LENGTH = 40;
const MAX_NOTES_LENGTH = 2000;

// All meditation routes need a signed-in user, and :username must be their own.
router.use(requireAuth);

// Get all meditation sessions for the signed-in user
router.get('/sessions/:username', requireSelf(), async (req, res) => {
  try {
    const sessions = await MeditationSession.find({ user: req.user._id })
      .sort({ date: -1 });
    res.json(sessions);
  } catch (err) {
    console.error('Fetching meditation sessions failed:', err?.name);
    res.status(500).send('Server Error');
  }
});

// Add a new meditation session for the signed-in user
router.post('/add/:username', requireSelf(), async (req, res) => {
  try {
    const { duration, type, notes } = req.body || {};
    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_DURATION_MINUTES) {
      return res.status(400).json({ msg: 'Please choose a valid duration.' });
    }
    if (typeof type !== 'string' || !type.trim() || type.length > MAX_TYPE_LENGTH) {
      return res.status(400).json({ msg: 'Please choose a meditation type.' });
    }
    if (notes !== undefined && (typeof notes !== 'string' || notes.length > MAX_NOTES_LENGTH)) {
      return res.status(400).json({ msg: `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.` });
    }

    const newSession = new MeditationSession({
      user: req.user._id,
      duration: minutes,
      type,
      notes,
      date: new Date()
    });

    const session = await newSession.save();
    res.json(session);
  } catch (err) {
    console.error('Saving meditation session failed:', err?.name);
    res.status(500).send('Server Error');
  }
});

export default router;
