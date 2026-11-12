import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import Navbar from '../navbar/Navbar';
import { FaHeart, FaRegHeart, FaComment, FaSearch } from 'react-icons/fa';
import './AnonymousPost.css';

// API response shapes (see backend/utils/communitySerializer.js):
// - GET /api/posts and /api/posts/trending -> { items: Post[], page, limit, hasMore }
// - Post -> { publicId, author, title, content, tags, likeCount, commentCount,
//            likedByMe, isMine, edited, postedAt, comments: Comment[] }
// - Comment -> { commentId, author, content, likeCount, postedAt }
// - POST /api/posts/comment/:publicId -> 200 Post, or 202 { status, message }
//   when the comment is held for moderator review; errors -> { error }
const API_BASE = 'http://localhost:8000/api/posts';

const errorMessage = (error, fallback) => error?.response?.data?.error || fallback;

const AllAnonymousPost = () => {
  // The create form passes a one-off success message when a post is published.
  const location = useLocation();
  const navigate = useNavigate();
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [activeCommentPost, setActiveCommentPost] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [trendingPosts, setTrendingPosts] = useState([]);
  // Success/info messages and API errors are kept apart so errors always get
  // the error style and an assertive (role="alert") announcement.
  const [notice, setNotice] = useState(
    typeof location.state?.notice === 'string' ? location.state.notice : ''
  );
  const [errorText, setErrorText] = useState('');

  // The success message is one-time: clear it from the router state once read,
  // so it does not come back on reload or back/forward navigation.
  useEffect(() => {
    if (location.state?.notice) {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
  }, [location, navigate]);

  const fetchPosts = useCallback(async () => {
    try {
      const response = await axios.get(API_BASE, {
        params: {
          search: searchQuery,
          tag: selectedTag,
          page
        }
      });
      setPosts(Array.isArray(response.data?.items) ? response.data.items : []);
      setHasMore(Boolean(response.data?.hasMore));
    } catch (error) {
      setPosts([]);
      setHasMore(false);
      setErrorText(errorMessage(error, 'Could not load posts. Please try again.'));
    }
  }, [searchQuery, selectedTag, page]);

  const fetchTrendingPosts = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/trending`);
      setTrendingPosts(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (error) {
      setTrendingPosts([]);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    fetchTrendingPosts();
  }, [fetchTrendingPosts]);

  // A new search or tag always starts again from the first page.
  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleTagSelect = (tag) => {
    setSelectedTag(tag);
    setPage(1);
  };

  const handleCommentSubmit = async (publicId) => {
    try {
      const response = await axios.post(`${API_BASE}/comment/${encodeURIComponent(publicId)}`, {
        content: newComment
      });
      setErrorText('');
      if (response.status === 202) {
        // Held for moderator review: saved, but not shown in the community yet.
        setNotice(response.data?.message || 'Your comment was submitted and will be reviewed before it appears.');
      } else {
        setNotice('Your comment was added.');
      }
      setNewComment('');
      setActiveCommentPost(null);
      fetchPosts();
    } catch (error) {
      setNotice('');
      setErrorText(errorMessage(error, 'Could not add the comment. Please try again.'));
    }
  };

  const handleLikePost = async (publicId) => {
    try {
      await axios.post(`${API_BASE}/like/${encodeURIComponent(publicId)}`);
      fetchPosts();
      fetchTrendingPosts();
    } catch (error) {
      setErrorText(errorMessage(error, 'Could not like the post. Please try again.'));
    }
  };

  const handleLikeComment = async (publicId, commentId) => {
    try {
      await axios.post(`${API_BASE}/comment/like/${encodeURIComponent(publicId)}/${encodeURIComponent(commentId)}`);
      fetchPosts();
    } catch (error) {
      setErrorText(errorMessage(error, 'Could not like the comment. Please try again.'));
    }
  };

  return (
    <>
      <Navbar />
      <div className="anonymous-posts-container">
        <div className="search-section">
          <div className="search-bar">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search posts or enter a post ID (e.g. WB-A7K92M4Q)..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        {notice && (
          <p className="community-notice" role="status">{notice}</p>
        )}
        {errorText && (
          <p className="community-notice community-notice--error" role="alert">{errorText}</p>
        )}

        <div className="posts-grid">
          <div className="main-content">
            {posts.map((post) => (
              <div key={post.publicId} className="post-card">
                <div className="post-header">
                  <div className="post-id">{post.publicId}</div>
                  <div className="post-date">
                    {post.author} · {new Date(post.postedAt).toLocaleDateString()}
                  </div>
                </div>

                <h3 className="post-title">{post.title}</h3>
                <p className="post-content">{post.content}</p>

                <div className="post-tags">
                  {post.tags && post.tags.map((tag, index) => (
                    <span
                      key={`${tag}-${index}`}
                      className="tag"
                      onClick={() => handleTagSelect(tag)}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>

                <div className="post-stats">
                  <div className="stat-item" onClick={() => handleLikePost(post.publicId)}>
                    {post.likeCount > 0 ? <FaHeart className="icon liked" /> : <FaRegHeart className="icon" />}
                    <span>{post.likeCount}</span>
                  </div>
                  <div className="stat-item">
                    <FaComment className="icon" />
                    <span>{post.commentCount}</span>
                  </div>
                </div>

                <div className="comments-section">
                  {(post.comments || []).map((comment) => (
                    <div key={comment.commentId} className="comment">
                      <p>{comment.content}</p>
                      <div className="comment-footer">
                        <small>{comment.author} · {new Date(comment.postedAt).toLocaleDateString()}</small>
                        <div className="comment-likes" onClick={() => handleLikeComment(post.publicId, comment.commentId)}>
                          <FaHeart className={`icon ${comment.likeCount > 0 ? 'liked' : ''}`} />
                          <span>{comment.likeCount}</span>
                        </div>
                      </div>
                    </div>
                  ))}

                  {activeCommentPost === post.publicId ? (
                    <div className="add-comment">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Write a comment..."
                        className="comment-input"
                      />
                      <div className="comment-actions">
                        <button
                          className="submit-btn"
                          onClick={() => handleCommentSubmit(post.publicId)}
                        >
                          Submit
                        </button>
                        <button
                          className="cancel-btn"
                          onClick={() => {
                            setActiveCommentPost(null);
                            setNewComment('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="add-comment-btn"
                      onClick={() => setActiveCommentPost(post.publicId)}
                    >
                      Add Comment
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="pagination-controls">
              <button
                type="button"
                className="cancel-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                className="submit-btn"
                onClick={() => setPage((p) => p + 1)}
                disabled={!hasMore}
              >
                Next
              </button>
            </div>
          </div>

          <div className="trending-sidebar">
            <h3>Trending Posts</h3>
            {trendingPosts.map((post) => (
              <div key={post.publicId} className="trending-post-card">
                <h4>{post.publicId} {post.title}</h4>
                <div className="trending-stats">
                  <span><FaHeart className="icon" /> {post.likeCount}</span>
                  <span><FaComment className="icon" /> {post.commentCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default AllAnonymousPost;
