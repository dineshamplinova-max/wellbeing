import Journal from "../models/journalModel.js";
import User from "../models/userModel.js";
import mongoose from "mongoose";

const MAX_TITLE_LENGTH = 200;
const MAX_ARTICLE_LENGTH = 20000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

const isNonEmptyString = (value, maxLength) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;

// Accepts an array or a comma-separated string (multipart forms send arrays as
// "a,b"). Returns null when the tags are not acceptable.
const parseTags = (tags) => {
    if (tags === undefined || tags === null || tags === '') return [];
    const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : null;
    if (!list) return null;
    const cleaned = list.filter((tag) => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean);
    if (cleaned.length > MAX_TAGS || cleaned.some((tag) => tag.length > MAX_TAG_LENGTH)) return null;
    return cleaned;
};

const parseBoolean = (value) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return null;
};

const isOwner = (journal, userId) => String(journal.author) === String(userId);

// Create a journal for the signed-in user. The author always comes from the session.
export const create_journal = async (req, res) => {
    try {
        const { title, article, tags, isPrivate } = req.body || {};
        if (!isNonEmptyString(title, MAX_TITLE_LENGTH) || !isNonEmptyString(article, MAX_ARTICLE_LENGTH)) {
            return res.status(400).json({ error: 'A title and journal text are required.' });
        }
        const parsedTags = parseTags(tags);
        if (parsedTags === null) {
            return res.status(400).json({ error: `Use up to ${MAX_TAGS} tags of ${MAX_TAG_LENGTH} characters or fewer.` });
        }

        const journalData = {
            title: title.trim(),
            article,
            author: req.user._id,
            tags: parsedTags,
            isPrivate: parseBoolean(isPrivate) === true
        };

        if (req.file) {
            journalData.coverPicture = `upload1/${req.file.filename}`;
        }

        const journalAdded = await Journal.create(journalData);
        await User.updateOne({ _id: req.user._id }, { $push: { journals: journalAdded._id } });

        return res.status(201).json(journalAdded);
    } catch (error) {
        console.error('Creating journal failed:', error?.name);
        return res.status(500).json({ error: 'Could not save the journal. Please try again.' });
    }
};

// Read all of the signed-in user's journals (public and private).
export const getPostsByUsername = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('journals');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        return res.status(200).json(user.journals);
    } catch (error) {
        console.error('Fetching journals failed:', error?.name);
        return res.status(500).json({ error: 'Could not load journals.' });
    }
};

// Update one of the signed-in user's journals. Only title, article, tags and
// isPrivate can change; author, likes, comments and ids are ignored.
export const update_journal = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ msg: 'No journal with that id' });
        }

        const journal = await Journal.findById(id);

        if (!journal) {
            return res.status(404).json({ msg: 'Journal not found' });
        }
        if (!isOwner(journal, req.user._id)) {
            return res.status(403).json({ msg: 'You can only edit your own journals.' });
        }

        const body = req.body || {};
        if (body.title !== undefined) {
            if (!isNonEmptyString(body.title, MAX_TITLE_LENGTH)) return res.status(400).json({ msg: 'Please enter a title.' });
            journal.title = body.title.trim();
        }
        if (body.article !== undefined) {
            if (!isNonEmptyString(body.article, MAX_ARTICLE_LENGTH)) return res.status(400).json({ msg: 'Please enter the journal text.' });
            journal.article = body.article;
        }
        if (body.tags !== undefined) {
            const parsedTags = parseTags(body.tags);
            if (parsedTags === null) return res.status(400).json({ msg: `Use up to ${MAX_TAGS} tags of ${MAX_TAG_LENGTH} characters or fewer.` });
            journal.tags = parsedTags;
        }
        if (body.isPrivate !== undefined) {
            const isPrivate = parseBoolean(body.isPrivate);
            if (isPrivate === null) return res.status(400).json({ msg: 'isPrivate must be true or false.' });
            journal.isPrivate = isPrivate;
        }

        await journal.save();
        return res.status(200).json(journal);
    } catch (error) {
        console.error('Updating journal failed:', error?.name);
        return res.status(500).json({ error: 'Could not update the journal. Please try again.' });
    }
};

// Delete one of the signed-in user's journals.
export const delete_journal = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ msg: 'No journal with that ID' });
        }

        const journal = await Journal.findById(id).select('_id author').lean();
        if (!journal) {
            return res.status(404).json({ msg: 'Journal not found!' });
        }
        if (!isOwner(journal, req.user._id)) {
            return res.status(403).json({ msg: 'You can only delete your own journals.' });
        }

        await Journal.deleteOne({ _id: journal._id, author: req.user._id });
        await User.updateOne({ _id: req.user._id }, { $pull: { journals: journal._id } });

        return res.status(200).json({ msg: 'Journal deleted successfully!' });
    } catch (error) {
        console.error('Deleting journal failed:', error?.name);
        return res.status(500).json({ error: 'Could not delete the journal. Please try again.' });
    }
};

// Fetch a single journal. Public journals are readable by any signed-in user;
// private ones only by their owner. Others get the same 404 as a missing journal,
// so the existence of a private journal is not revealed.
export const getJournalById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ error: 'Journal not found' });
        }

        const journal = await Journal.findById(id).lean();

        if (!journal || (journal.isPrivate && !isOwner(journal, req.user._id))) {
            return res.status(404).json({ error: 'Journal not found' });
        }

        return res.status(200).json(journal);
    } catch (error) {
        console.error('Fetching journal by id failed:', error?.name);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
