import React, { useState } from 'react';
import Navbar from '../navbar/Navbar';
import { useNavigate } from 'react-router-dom';
import { FaTags, FaLock, FaInfoCircle } from 'react-icons/fa';
import axios from 'axios';
import './AnonymousPost.css';

// POST /api/posts/create responses (see backend/controller/anonymous-controller.js):
// - 201 Post: published. Go to the feed, which shows a one-off success message.
// - 202 { status: 'pending_review', message, publicId }: saved but held for
//   moderator review, so it is NOT visible in the community yet.
// - 400 / 503 / other { error }: shown on the page (for example, a request to
//   remove contact details).
const publishedMessage = (publicId) => (publicId
  ? `Your post was published to the community. Post ID: ${publicId}.`
  : 'Your post was published to the community.');

const AnonymousPost = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  // A post held for review ({ publicId, safetyMessage }) and API errors are
  // kept in separate state so each gets its own accessible message.
  const [pendingReview, setPendingReview] = useState(null);
  const [errorText, setErrorText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const user = localStorage.getItem('tokenUser');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPendingReview(null);
    setErrorText('');
    setSubmitting(true);

    try {
      const response = await axios.post('http://localhost:8000/api/posts/create', {
        title,
        content,
        tags: tags.split(',').map(tag => tag.trim())
      });

      const publicId = typeof response.data?.publicId === 'string' ? response.data.publicId : '';
      if (response.status === 201) {
        // Published: go to the feed with a one-time success message.
        navigate(`/${user}/allanonymousposts`, { state: { notice: publishedMessage(publicId) } });
      } else if (response.status === 202) {
        // Held for review: stay here (it is not public yet) and clear the form.
        setPendingReview({
          publicId,
          safetyMessage: typeof response.data?.message === 'string' ? response.data.message : '',
        });
        setTitle('');
        setContent('');
        setTags('');
      }
    } catch (error) {
      const serverError = error?.response?.data?.error;
      setErrorText(typeof serverError === 'string' && serverError
        ? serverError
        : 'Could not publish the post. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="create-post-container">
        <div className="create-post-header">
          <h1>Create Anonymous Post</h1>
          <p>Share your thoughts in a safe and supportive environment</p>
        </div>

        <div className="post-form-container">
          <div className="privacy-notice">
            <FaLock className="privacy-icon" />
            <div>
              <h3>Your Privacy Matters</h3>
              <p>Your posts are anonymous to other community members. We don't display your username or profile details.</p>
            </div>
          </div>

          {pendingReview && (
            <div className="community-notice" role="status">
              <p><strong>Your post was submitted successfully.</strong> It is not publicly visible yet.</p>
              {pendingReview.publicId && <p>Post ID: {pendingReview.publicId}</p>}
              {/* The backend's message explains the review and carries the safety information. */}
              {pendingReview.safetyMessage && <p>{pendingReview.safetyMessage}</p>}
            </div>
          )}
          {errorText && (
            <p className="community-notice community-notice--error" role="alert">{errorText}</p>
          )}

          <form onSubmit={handleSubmit} className="post-form">
            <div className="form-group">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Give your post a meaningful title"
                required
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="content">Your Message</label>
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Share your thoughts, feelings, or experiences..."
                required
                className="form-textarea"
              />
            </div>

            <div className="form-group">
              <label htmlFor="tags" className="tags-label">
                <FaTags className="tags-icon" />
                Tags
              </label>
              <input
                id="tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Add tags separated by commas (e.g., anxiety, support, advice)"
                className="form-input"
              />
            </div>

            <div className="posting-guidelines">
              <FaInfoCircle className="info-icon" />
              <div>
                <h4>Posting Guidelines</h4>
                <ul>
                  <li>Be respectful and supportive</li>
                  <li>Avoid sharing personal identifying information</li>
                  <li>Use trigger warnings when discussing sensitive topics</li>
                </ul>
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="cancel-button"
              >
                Cancel
              </button>
              <button type="submit" className="submit-button" disabled={submitting}>
                {submitting ? 'Posting...' : 'Post Anonymously'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default AnonymousPost;
