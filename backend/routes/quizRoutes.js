import express from 'express';
import { requireAuth, requireSelf } from '../middleware/requireAuth.js';
import { listQuizResults, saveQuizResult, deleteQuizResult, clearQuizResults } from '../controller/quiz-controller.js';

const router = express.Router();
const self = requireSelf();

// All quiz routes need a signed-in user, and :username must be their own.
// Data access always uses req.user._id.
router.use(requireAuth);

router.get('/:username/results', self, listQuizResults);
router.post('/:username/results', self, saveQuizResult);
router.delete('/:username/results', self, clearQuizResults);
router.delete('/:username/results/:id', self, deleteQuizResult);

export default router;
