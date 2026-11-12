import mongoose from 'mongoose';

// Canonical model for anonymous community posts.
//
// Index changes are managed only by backend/migrations/community-v1.mjs, never
// automatically at server start (autoIndex/autoCreate are off for this schema),
// so the app cannot build or clash with indexes on an existing database.

const STATUSES = ['visible', 'pending_review', 'hidden', 'removed'];

const commentSchema = new mongoose.Schema({
    // Public comment ID ("WBC-" + 8 random characters). Comment _ids are never exposed.
    commentId: {
        type: String
    },
    content: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    likes: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: STATUSES,
        default: 'pending_review'
    },
    // 0 = not screened. Only screened, visible comments are served.
    screeningVersion: {
        type: Number,
        default: 0
    },
    reviewReason: {
        type: String
    }
});

const anonymousPostSchema = new mongoose.Schema({
    // Permanent public ID ("WB-" + 8 random characters), separate from _id.
    publicId: {
        type: String,
        required: true
    },
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    // Legacy identifier. New posts store the same value as publicId so the
    // existing unique postId index keeps working; it is never shown publicly.
    postId: {
        type: String,
        required: true,
        unique: true
    },
    tags: [
        {
            type: String
        }
    ],
    // Legacy field. Image uploads are disabled and images are not served publicly.
    imageUrl: {
        type: String
    },
    likes: {
        type: Number,
        default: 0
    },
    views: {
        type: Number,
        default: 0
    },
    comments: [commentSchema],
    // Unknown or legacy content is never visible by default.
    status: {
        type: String,
        enum: STATUSES,
        default: 'pending_review'
    },
    // 0 = not screened. Only screened, visible posts are served.
    screeningVersion: {
        type: Number,
        default: 0
    },
    // Why content is held (for moderators only); never returned publicly.
    reviewReason: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    autoIndex: false,
    autoCreate: false
});

// Index declarations (created only by the migration script).
anonymousPostSchema.index(
    { publicId: 1 },
    { unique: true, partialFilterExpression: { publicId: { $type: 'string' } }, name: 'publicId_unique' }
);
anonymousPostSchema.index({ postId: 1 });
anonymousPostSchema.index({ title: 'text', content: 'text', tags: 'text' });
anonymousPostSchema.index({ likes: -1, views: -1, createdAt: -1 });

const AnonymousPost = mongoose.model('AnonymousPost', anonymousPostSchema);

export default AnonymousPost;
