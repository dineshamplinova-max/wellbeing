import express from 'express';
import { postImageUpload } from '../multer/multerConfig.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getAnonymousPosts,
  createAnonymousPost,
  addComment,
  likePost,
  likeComment,
  getTrendingPosts,
  getPost
} from '../controller/anonymous-controller.js';

const router = express.Router();

// Every community route needs a signed-in user, but posts and comments never
// store who wrote them, so they stay anonymous.
router.use(requireAuth);

// Get all posts with search functionality
router.get('/posts', getAnonymousPosts);

// Create a new post
router.post('/create', postImageUpload.single('image'), createAnonymousPost);

// Add a comment to a post
router.post('/comment/:postId', addComment);

// Like a post
router.post('/like/:postId', likePost);

// Like a comment
router.post('/comment/like/:postId/:commentId', likeComment);

// Get a specific post (by public ID). Responses go through the whitelist
// serializer, so MongoDB _id and internal fields are never returned.
router.get('/post/:postId', getPost);

// Get trending posts
router.get('/trending', getTrendingPosts);

// Post routes
router.get('/api/posts', getAnonymousPosts);
router.post('/api/posts/create', postImageUpload.single('image'), createAnonymousPost);
router.get('/api/posts/trending', getTrendingPosts);

// Comment routes
router.post('/api/posts/:postId/comments', addComment);

// Like routes
router.post('/api/posts/:postId/like', likePost);
router.post('/api/posts/:postId/comments/:commentId/like', likeComment);

export default router;
