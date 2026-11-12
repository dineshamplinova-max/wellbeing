import fs from 'fs/promises';
import AnonymousPost from '../models/anonymousSchema.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import {
  createWithUniqueId,
  idSource,
  normalizeCommentId,
  normalizePublicId,
  MAX_ID_ATTEMPTS,
} from '../utils/publicId.js';
import { CURRENT_SCREENING_VERSION, isPubliclyServable, toPublicPost } from '../utils/communitySerializer.js';
import { pageResponse, parsePagination } from '../utils/pagination.js';
import {
  cleanText,
  HELD_FOR_REVIEW_MESSAGE,
  PERSONAL_INFO_MESSAGES,
  screenCommunityText,
} from '../utils/communityContent.js';

// Community posts and comments never store who wrote them. Routes require a
// signed-in user, but nothing about that user is saved with the content, and
// every response goes through the whitelist serializer (toPublicPost).

const MAX_SEARCH_LENGTH = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 10000;
const MAX_COMMENT_LENGTH = 2000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const MAX_COMMENTS_PER_POST = 500;

const FEED_PAGINATION = { defaultLimit: 20, maxLimit: 20, maxPage: 50 };
const TRENDING_LIMIT = 10;
const TRENDING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// Only screened, visible posts with a public ID are ever served.
const SERVABLE_FILTER = Object.freeze({
  publicId: { $exists: true },
  status: 'visible',
  screeningVersion: { $gte: CURRENT_SCREENING_VERSION },
});

const isNonEmptyString = (value, maxLength) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;

const notFound = (res) => res.status(404).json({ error: 'Post not found' });

// Builds the feed filter. User text is escaped so it is matched literally and
// never interpreted as a regular expression. A search term that is a public ID
// matches that post only.
const buildPostSearchQuery = ({ search, tag }) => {
  const query = { ...SERVABLE_FILTER };

  if (typeof search === 'string' && search.trim()) {
    const term = search.trim().slice(0, MAX_SEARCH_LENGTH);
    const publicId = normalizePublicId(term);
    if (publicId) {
      query.publicId = publicId;
    } else {
      const pattern = new RegExp(escapeRegex(term), 'i');
      query.$or = [
        { title: pattern },
        { content: pattern },
        { tags: { $in: [pattern] } },
      ];
    }
  }

  if (typeof tag === 'string' && tag.trim()) {
    query.tags = { $in: [new RegExp(escapeRegex(tag.trim().slice(0, MAX_SEARCH_LENGTH)), 'i')] };
  }

  return query;
};

// Tags arrive as an array (JSON) or a JSON/comma-separated string (multipart).
const parsePostTags = (tags) => {
  if (tags === undefined || tags === null || tags === '') return [];
  let list = tags;
  if (typeof tags === 'string') {
    try {
      list = JSON.parse(tags);
    } catch {
      list = tags.split(',');
    }
  }
  if (!Array.isArray(list)) return null;
  const cleaned = list.filter((t) => typeof t === 'string').map((t) => cleanText(t).trim()).filter(Boolean);
  if (cleaned.length > MAX_TAGS || cleaned.some((t) => t.length > MAX_TAG_LENGTH)) return null;
  return cleaned;
};

// Finds a post that may be served, by public ID or (for already-migrated posts
// only) by the legacy postId used in older links. Anything else is "not found",
// so hidden or unscreened posts are indistinguishable from missing ones.
const findServablePost = async (param) => {
  if (typeof param !== 'string' || !param || param.length > 40) return null;
  const publicId = normalizePublicId(param);
  const filter = publicId ? { ...SERVABLE_FILTER, publicId } : { ...SERVABLE_FILTER, postId: param };
  return AnonymousPost.findOne(filter);
};

const sendHeldForReview = (res, extra = {}) => res.status(202).json({
  status: 'pending_review',
  message: HELD_FOR_REVIEW_MESSAGE,
  ...extra,
});

export const getAnonymousPosts = async (req, res) => {
  try {
    const paging = parsePagination(req.query, FEED_PAGINATION);
    if (paging.error) return res.status(400).json({ error: paging.error });

    const posts = await AnonymousPost.find(buildPostSearchQuery(req.query))
      .sort({ createdAt: -1 })
      .skip(paging.skip)
      .limit(paging.limit + 1)
      .lean();
    return res.status(200).json(pageResponse(posts, paging, toPublicPost));
  } catch (error) {
    console.error('Fetching community posts failed:', error?.name);
    return res.status(500).json({ error: 'Could not load posts.' });
  }
};

// Image uploads are disabled until file-content validation and metadata removal
// exist. The upload middleware still runs on some routes until Phase 2, so any
// file it stored is deleted straight away and the request is rejected.
const discardUpload = async (file) => {
  if (!file?.path) return;
  try {
    await fs.unlink(file.path);
  } catch (error) {
    console.error('Removing a rejected community upload failed:', error?.code);
  }
};

export const createAnonymousPost = async (req, res) => {
  try {
    if (req.file || (Array.isArray(req.files) && req.files.length)) {
      await discardUpload(req.file);
      return res.status(400).json({ error: 'Image uploads are not available in the community yet. Please post text only.' });
    }
    const { title, content, tags } = req.body || {};
    if (!isNonEmptyString(title, MAX_TITLE_LENGTH) || !isNonEmptyString(content, MAX_CONTENT_LENGTH)) {
      return res.status(400).json({ error: 'A title and message are required.' });
    }
    const parsedTags = parsePostTags(tags);
    if (parsedTags === null) {
      return res.status(400).json({ error: `Use up to ${MAX_TAGS} tags of ${MAX_TAG_LENGTH} characters or fewer.` });
    }

    const cleanTitle = cleanText(title).trim();
    const cleanContent = cleanText(content);
    if (!cleanTitle || !cleanContent.trim()) {
      return res.status(400).json({ error: 'A title and message are required.' });
    }

    const screening = screenCommunityText([cleanTitle, cleanContent, ...parsedTags]);
    if (screening.personalInfo) {
      return res.status(400).json({ error: PERSONAL_INFO_MESSAGES[screening.personalInfo] });
    }
    const held = Boolean(screening.flaggedCategory);

    const saved = await createWithUniqueId(
      (publicId) => new AnonymousPost({
        publicId,
        postId: publicId,
        title: cleanTitle,
        content: cleanContent,
        tags: parsedTags,
        status: held ? 'pending_review' : 'visible',
        screeningVersion: CURRENT_SCREENING_VERSION,
        reviewReason: held ? screening.flaggedCategory : undefined,
      }).save(),
      { generate: idSource.post, fields: ['publicId', 'postId'], maxAttempts: MAX_ID_ATTEMPTS },
    );

    if (held) return sendHeldForReview(res, { publicId: saved.publicId });
    return res.status(201).json(toPublicPost(saved));
  } catch (error) {
    if (error?.code === 'PUBLIC_ID_EXHAUSTED') {
      return res.status(503).json({ error: 'Could not publish the post right now. Please try again.' });
    }
    console.error('Creating community post failed:', error?.name);
    return res.status(500).json({ error: 'Could not publish the post. Please try again.' });
  }
};

export const getPost = async (req, res) => {
  try {
    const post = await findServablePost(req.params.postId);
    if (!post) return notFound(res);
    await AnonymousPost.updateOne({ _id: post._id }, { $inc: { views: 1 } });
    return res.status(200).json(toPublicPost(post));
  } catch (error) {
    console.error('Fetching community post failed:', error?.name);
    return res.status(500).json({ error: 'Could not load the post.' });
  }
};

export const addComment = async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!isNonEmptyString(content, MAX_COMMENT_LENGTH) || !cleanText(content).trim()) {
      return res.status(400).json({ error: 'Please write a comment first.' });
    }
    const cleanContent = cleanText(content);

    const post = await findServablePost(req.params.postId);
    if (!post) return notFound(res);
    if (post.comments.length >= MAX_COMMENTS_PER_POST) {
      return res.status(409).json({ error: 'This post cannot take more comments.' });
    }

    const screening = screenCommunityText([cleanContent]);
    if (screening.personalInfo) {
      return res.status(400).json({ error: PERSONAL_INFO_MESSAGES[screening.personalInfo] });
    }
    const held = Boolean(screening.flaggedCategory);

    // Comment IDs only need to be unique within their post for now; they get a
    // collection-wide unique index when comments move to their own collection.
    const used = new Set(post.comments.map((c) => c.commentId));
    let commentId = null;
    for (let attempt = 0; attempt < MAX_ID_ATTEMPTS && !commentId; attempt += 1) {
      const candidate = idSource.comment();
      if (!used.has(candidate)) commentId = candidate;
    }
    if (!commentId) return res.status(503).json({ error: 'Could not add the comment right now. Please try again.' });

    post.comments.unshift({
      commentId,
      content: cleanContent,
      date: new Date(),
      likes: 0,
      status: held ? 'pending_review' : 'visible',
      screeningVersion: CURRENT_SCREENING_VERSION,
      reviewReason: held ? screening.flaggedCategory : undefined,
    });
    await post.save();

    if (held) return sendHeldForReview(res);
    return res.status(200).json(toPublicPost(post));
  } catch (error) {
    console.error('Adding comment failed:', error?.name);
    return res.status(500).json({ error: 'Could not add the comment.' });
  }
};

export const likePost = async (req, res) => {
  try {
    const post = await findServablePost(req.params.postId);
    if (!post) return notFound(res);

    await AnonymousPost.updateOne({ _id: post._id }, { $inc: { likes: 1 } });
    const updated = await AnonymousPost.findOne({ _id: post._id, ...SERVABLE_FILTER }).lean();
    if (!updated) return notFound(res);
    return res.status(200).json(toPublicPost(updated));
  } catch (error) {
    console.error('Liking post failed:', error?.name);
    return res.status(500).json({ error: 'Could not like the post.' });
  }
};

export const likeComment = async (req, res) => {
  try {
    const post = await findServablePost(req.params.postId);
    if (!post) return notFound(res);

    // Comments are addressed by their public commentId only, never by _id.
    const commentId = normalizeCommentId(req.params.commentId);
    const comment = commentId ? post.comments.find((c) => c.commentId === commentId) : null;
    if (!comment || !isPubliclyServable(comment)) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    comment.likes += 1;
    await post.save();
    return res.status(200).json(toPublicPost(post));
  } catch (error) {
    console.error('Liking comment failed:', error?.name);
    return res.status(500).json({ error: 'Could not like the comment.' });
  }
};

export const getTrendingPosts = async (req, res) => {
  try {
    const since = new Date(Date.now() - TRENDING_WINDOW_MS);
    const posts = await AnonymousPost.find({ ...SERVABLE_FILTER, createdAt: { $gte: since } })
      .sort({ likes: -1, createdAt: -1 })
      .limit(TRENDING_LIMIT)
      .lean();
    return res.status(200).json(pageResponse(posts, { page: 1, limit: TRENDING_LIMIT }, toPublicPost));
  } catch (error) {
    console.error('Fetching trending posts failed:', error?.name);
    return res.status(500).json({ error: 'Could not load trending posts.' });
  }
};
