import React, { useState, useEffect, useMemo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom'; // Import useNavigate
import axios from 'axios';
import { collectTags, filterJournals, journalDate, journalTags, sortJournals } from './journalFilters';
import defaultCoverImage from './download.jpg'; 
import './Modal.css';

const Readjournal = () => {
    const [journals, setJournals] = useState([]);
    const [showConfirmationModal, setShowConfirmationModal] = useState(false); // State for confirmation modal
    const [journalToDelete, setJournalToDelete] = useState(null); // State to store journal to delete
    const [loaded, setLoaded] = useState(false);
    // Search, tag and sort choices live only in this component's state.
    const [query, setQuery] = useState('');
    const [tag, setTag] = useState('');
    const [order, setOrder] = useState('newest');
    const { username } = useParams();
    const navigate = useNavigate();

    useEffect(() => {
        const fetchJournals = async () => {
            try {
                const response = await axios.get(`http://localhost:8000/${username}/journals`);
                setJournals(response.data);
            } catch (error) {
                console.error('Error fetching journals:', error);
            } finally {
                setLoaded(true);
            }
        };
        fetchJournals();
    }, [username]);

    const allEntries = useMemo(() => filterJournals(journals), [journals]);
    const tags = useMemo(() => collectTags(allEntries), [allEntries]);
    // A chosen tag that no longer exists (e.g. after a delete) means "All tags".
    const activeTag = tags.includes(tag) ? tag : '';
    const visibleJournals = useMemo(
        () => sortJournals(filterJournals(allEntries, { query, tag: activeTag }), order),
        [allEntries, query, activeTag, order]
    );

    const clearFilters = () => {
        setQuery('');
        setTag('');
    };

    const shortenText = (text, maxLength) => {
        if (typeof text !== 'string') return '';
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    };

    const handleEdit = (journalId) => {
        navigate(`/${username}/journals/${journalId}/edit`);
    };

    const handleDelete = (journalId) => {
        setJournalToDelete(journalId); // Set the journal to delete
        setShowConfirmationModal(true); // Show confirmation modal
    };

    const confirmDelete = async () => {
        try {
            await axios.delete(`http://localhost:8000/journal-delete/${username}/${journalToDelete}`);
            // Remove the deleted journal from the state
            setJournals(journals.filter(journal => journal._id !== journalToDelete));
            // Close the confirmation modal
            setShowConfirmationModal(false);
        } catch (error) {
            console.error('Error deleting journal:', error);
        }
    };

    const closeModal = () => {
        setShowConfirmationModal(false);
    };

    return (
        <div className="bg-wb-surface py-24 sm:py-32">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl lg:mx-0">
                    <h2 className="text-3xl font-bold tracking-tight text-wb-text sm:text-4xl">Your Journal</h2>
                    <p className="mt-2 text-lg leading-8 text-wb-muted">
                        Keep your memorable days stored with you!
                    </p>
                </div>

                {loaded && allEntries.length === 0 && (
                    <div className="mx-auto mt-10 max-w-2xl border-t border-wb-border pt-10 lg:mx-0">
                        <p className="text-wb-muted">No journal entries yet.</p>
                        <Link to={`/${username}/createjournal`} className="mt-2 inline-block text-sm font-medium text-wb-primary hover:text-wb-primary">
                            Write your first entry
                        </Link>
                    </div>
                )}

                {allEntries.length > 0 && (
                    <div className="mx-auto mt-10 max-w-2xl lg:mx-0 lg:max-w-none">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                            <div className="flex-1">
                                <label htmlFor="journal-search" className="block text-sm font-medium text-wb-muted mb-1">Search</label>
                                <input
                                    id="journal-search"
                                    type="search"
                                    autoComplete="off"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search titles and entries"
                                    className="w-full rounded-md border border-wb-control px-3 py-2 text-sm text-wb-text focus:ring-2 focus:ring-wb-primary focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label htmlFor="journal-tag" className="block text-sm font-medium text-wb-muted mb-1">Tag</label>
                                <select
                                    id="journal-tag"
                                    value={activeTag}
                                    onChange={(e) => setTag(e.target.value)}
                                    className="w-full rounded-md border border-wb-control px-3 py-2 text-sm text-wb-text focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:w-auto"
                                >
                                    <option value="">All tags</option>
                                    {tags.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="journal-sort" className="block text-sm font-medium text-wb-muted mb-1">Sort</label>
                                <select
                                    id="journal-sort"
                                    value={order}
                                    onChange={(e) => setOrder(e.target.value)}
                                    className="w-full rounded-md border border-wb-control px-3 py-2 text-sm text-wb-text focus:ring-2 focus:ring-wb-primary focus:border-transparent sm:w-auto"
                                >
                                    <option value="newest">Newest first</option>
                                    <option value="oldest">Oldest first</option>
                                </select>
                            </div>
                        </div>
                        <p className="mt-3 text-sm text-wb-muted" aria-live="polite">
                            Showing {visibleJournals.length} of {allEntries.length} {allEntries.length === 1 ? 'entry' : 'entries'}
                        </p>
                        {visibleJournals.length === 0 && (
                            <div className="mt-6">
                                <p className="text-wb-muted">No entries match your search.</p>
                                <button type="button" onClick={clearFilters} className="mt-2 text-sm font-medium text-wb-primary hover:text-wb-primary">
                                    Clear filters
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {visibleJournals.length > 0 && (
                <div className="mx-auto mt-10 grid max-w-2xl grid-cols-1 gap-x-8 gap-y-16 border-t border-wb-border pt-10 sm:mt-16 sm:pt-16 lg:mx-0 lg:max-w-none lg:grid-cols-3">
                    {visibleJournals.map((journal) => {
                        const coverImage = journal.coverPicture ? `http://localhost:8000/${journal.coverPicture}` : defaultCoverImage;
                        const date = journalDate(journal);

                        return (
                            <div key={journal._id} className="wb-hover-card bg-wb-surface shadow-md rounded-lg overflow-hidden relative">
                                <article className="p-6 flex flex-col justify-between h-full">
                                    <div>
                                        <div className="flex items-center gap-x-4 text-xs mb-3">
                                            {date && (
                                                <time dateTime={date.toISOString()} className="text-wb-muted">
                                                    {date.toLocaleDateString()}
                                                </time>
                                            )}
                                        </div>
                                        <div className="group relative">
                                            <h3 className="text-lg font-semibold leading-6 text-wb-text group-hover:text-wb-muted mb-2">
                                                <Link to={`/${username}/readjournals/${journal._id}`}>
                                                    {typeof journal.title === 'string' && journal.title.trim() ? journal.title : 'Untitled journal'}
                                                </Link>
                                            </h3>
                                            <p className="line-clamp-3 text-sm leading-6 text-wb-muted mb-4">
                                                {shortenText(journal.article, 50)} {/* Show first 50 characters */}
                                            </p>
                                        </div>
                                    </div>
                                    <img src={coverImage} alt="Cover" className="mt-auto h-24 w-full object-cover" />
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {journalTags(journal).map((tag, index) => (
                                            <span key={index} className="inline-flex items-center rounded-full bg-wb-primary-soft px-3 py-0.5 text-sm font-medium text-wb-primary-hover">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    <div className="absolute top-2 right-2 flex gap-2">
                                        <button
                                            className="bg-wb-primary text-white px-3 py-1 rounded-md hover:bg-wb-primary-hover"
                                            onClick={() => handleEdit(journal._id)}
                                        >
                                            Edit
                                        </button>
                                        <button
                                            className="bg-wb-danger text-white px-3 py-1 rounded-md hover:bg-wb-danger-hover"
                                            onClick={() => handleDelete(journal._id)}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </article>
                            </div>
                        );
                    })}
                </div>
                )}
            </div>
            {showConfirmationModal && (
  <div className="modal-overlay">
    <div className="modal-content">
      <p className="text-lg font-semibold mb-4">Are you sure you want to delete this journal?</p>
      <div className="modal-buttons">
        <button className="bg-wb-danger text-white px-4 py-2 rounded-md mr-2 hover:bg-wb-danger-hover" onClick={confirmDelete}>Delete</button>
        <button className="bg-wb-border text-wb-text px-4 py-2 rounded-md hover:bg-wb-muted" onClick={closeModal}>Cancel</button>
      </div>
    </div>
  </div>
)}
        </div>
    );
}

export default Readjournal;


