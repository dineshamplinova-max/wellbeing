// Whitelist serializers for public community responses.
//
// Every public field is copied explicitly. Documents are never spread or turned
// into objects wholesale, so fields added to the schema later (ownership keys,
// review reasons, internal ids) can only appear in a response if they are added
// here on purpose. Never included: _id, __v, the legacy postId, imageUrl (image
// uploads are disabled until metadata removal exists), views, status, review
// details and exact timestamps.

export const AUTHOR_LABEL = 'Anonymous member';
export const MAX_EMBEDDED_COMMENTS = 50;
export const CURRENT_SCREENING_VERSION = 1;

// Public times are truncated to the hour; the frontend shows them as relative times.
export const hourBucket = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const truncated = new Date(date.getTime());
  truncated.setUTCMinutes(0, 0, 0);
  return truncated.toISOString();
};

const toCount = (value) => (Number.isInteger(value) && value > 0 ? value : 0);
const toText = (value) => (typeof value === 'string' ? value : '');

// Content may be served only when it is visible and has passed screening.
export const isPubliclyServable = (item) => Boolean(item)
  && item.status === 'visible'
  && Number(item.screeningVersion) >= CURRENT_SCREENING_VERSION;

export const toPublicComment = (comment) => ({
  commentId: comment.commentId,
  author: AUTHOR_LABEL,
  content: toText(comment.content),
  likeCount: toCount(comment.likes),
  postedAt: hourBucket(comment.date),
});

const servableComments = (post) => [...(post.comments || [])]
  .filter((c) => c && typeof c.commentId === 'string' && isPubliclyServable(c));

export const toPublicPost = (post) => {
  const comments = servableComments(post);
  return {
    publicId: post.publicId,
    author: AUTHOR_LABEL,
    title: toText(post.title),
    content: toText(post.content),
    tags: [...(post.tags || [])].filter((t) => typeof t === 'string'),
    likeCount: toCount(post.likes),
    commentCount: comments.length,
    likedByMe: false, // per-viewer state arrives with like/unlike (Phase 4)
    isMine: false, // private ownership arrives in Phase 3
    edited: false, // editing arrives in Phase 3
    postedAt: hourBucket(post.createdAt),
    comments: comments.slice(0, MAX_EMBEDDED_COMMENTS).map(toPublicComment),
  };
};
