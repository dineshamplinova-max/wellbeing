import React, { useState, useRef, useEffect } from 'react';
import Navbar from '../navbar/Navbar';
import { useNavigate } from 'react-router-dom';
import { FaImage, FaTags, FaLock, FaUnlock } from 'react-icons/fa';
import JournalPrompts from './JournalPrompts';
import JournalTextStats from './JournalTextStats';

// Puts a chosen prompt into the editor: the prompt alone when it is empty,
// otherwise as a new paragraph after the existing text (never replacing it).
const addPrompt = (text, prompt) => {
  if (text === '') return `${prompt} `;
  const separator = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${separator}${prompt} `;
};

const CreateJournal = () => {
  const [title, setTitle] = useState('');
  const [article, setArticle] = useState('');
  const [tags, setTags] = useState('');
  const [coverPicture, setCoverPicture] = useState(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const user = localStorage.getItem('tokenUser');
  const navigate = useNavigate();
  const articleRef = useRef(null);
  const focusArticleEnd = useRef(false);

  // After a prompt is added, place the cursor at the end of the text.
  useEffect(() => {
    if (!focusArticleEnd.current || !articleRef.current) return;
    focusArticleEnd.current = false;
    const textarea = articleRef.current;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.scrollTop = textarea.scrollHeight;
  }, [article]);

  const handlePromptSelect = (prompt) => {
    focusArticleEnd.current = true;
    setArticle((current) => addPrompt(current, prompt));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const formData = new FormData();
    formData.append('title', title);
    formData.append('article', article);
    
    // Handle tags properly
    if (tags) {
      const tagsArray = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      formData.append('tags', tagsArray);
    }
    
    formData.append('isPrivate', isPrivate);

    if (coverPicture) {
      formData.append('coverPicture', coverPicture);
    }

    try {
      const response = await fetch(`http://localhost:8000/${user}`, {
        method: 'POST',
        // Sends the httpOnly session cookie.
        credentials: 'include',
        body: formData
      });

      if (response.ok) {
        const newJournal = await response.json();
        console.log('Journal created:', newJournal);
        navigate(`/${user}/readjournals`);
      } else {
        const errorData = await response.json();
        console.error('Failed to create journal:', errorData);
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleFileChange = (e) => {
    setCoverPicture(e.target.files[0]);
  };

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gradient-to-br from-wb-primary-soft via-wb-surface to-wb-accent-soft py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-wb-surface rounded-xl shadow-lg overflow-hidden">
            <div className="px-6 py-8">
              <h2 className="text-3xl font-bold text-wb-text text-center mb-8">Create New Journal</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Cover Picture Upload */}
                <div className="relative group cursor-pointer">
                  <div className="flex items-center justify-center w-full h-48 border-2 border-dashed border-wb-border rounded-lg hover:border-wb-primary transition-colors">
                    <div className="text-center">
                      <FaImage className="mx-auto h-12 w-12 text-wb-muted group-hover:text-wb-primary transition-colors" />
                      <label className="mt-2 block text-sm font-medium text-wb-muted group-hover:text-wb-primary cursor-pointer">
                        {coverPicture ? coverPicture.name : 'Add Cover Image'}
                        <input
                          type="file"
                          className="hidden"
                          onChange={handleFileChange}
                          accept="image/*"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                {/* Title Input */}
                <div>
                  <label className="block text-sm font-medium text-wb-muted mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-wb-control focus:ring-2 focus:ring-wb-primary focus:border-transparent transition-all"
                    placeholder="Give your journal a meaningful title"
                    required
                  />
                </div>

                {/* Optional guided prompts */}
                <JournalPrompts onSelect={handlePromptSelect} />

                {/* Content Input */}
                <div>
                  <label htmlFor="journal-article" className="block text-sm font-medium text-wb-muted mb-2">
                    Content
                  </label>
                  <textarea
                    id="journal-article"
                    ref={articleRef}
                    value={article}
                    onChange={(e) => setArticle(e.target.value)}
                    rows="8"
                    className="w-full px-4 py-3 rounded-lg border border-wb-control focus:ring-2 focus:ring-wb-primary focus:border-transparent transition-all"
                    placeholder="Share your thoughts, feelings, and experiences..."
                    aria-describedby="journal-article-stats"
                    required
                  />
                  <JournalTextStats id="journal-article-stats" text={article} />
                </div>

                {/* Tags Input */}
                <div>
                  <label className="block text-sm font-medium text-wb-muted mb-2 flex items-center">
                    <FaTags className="mr-2" />
                    Tags
                  </label>
                  <input
                    type="text"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    className="w-full px-4 py-3 rounded-lg border border-wb-control focus:ring-2 focus:ring-wb-primary focus:border-transparent transition-all"
                    placeholder="Add tags separated by commas (e.g., personal, reflection, growth)"
                  />
                </div>

                {/* Privacy Toggle */}
                <div className="flex items-center justify-between bg-wb-subtle rounded-lg p-4">
                  <div className="flex items-center">
                    {isPrivate ? <FaLock className="text-wb-primary mr-2" /> : <FaUnlock className="text-wb-muted mr-2" />}
                    <span className="text-sm font-medium text-wb-muted">Make this journal private</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsPrivate(!isPrivate)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isPrivate ? 'bg-wb-primary' : 'bg-wb-border'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-wb-surface shadow ring-0 transition duration-200 ease-in-out ${
                        isPrivate ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-4 pt-6">
                  <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="px-6 py-3 rounded-lg text-wb-muted hover:bg-wb-subtle transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-3 rounded-lg bg-wb-primary text-white hover:bg-wb-primary-hover transition-colors"
                  >
                    Publish Journal
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CreateJournal;
