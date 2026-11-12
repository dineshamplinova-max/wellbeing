import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import defaultCoverImage from './download.jpg'; // Make sure this path is correct relative to your file structure
import { journalDate, journalTags } from './journalFilters';

const JournalDetail = () => {
    const { id, username } = useParams();
    const [journal, setJournal] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchJournal = async () => {
            try {
                const response = await axios.get(`http://localhost:8000/${username}/${id}`);
                setJournal(response.data);
            } catch (error) {
                setError('Error fetching journal details');
            }
        };
        fetchJournal();
    }, [username, id]);

    if (error) {
        return <div>{error}</div>;
    }

    if (!journal) {
        return <div>Loading...</div>;
    }

    const coverImage = journal.coverPicture ? `http://localhost:8000/${journal.coverPicture}` : defaultCoverImage;
    const date = journalDate(journal);

    return (
        <div className="bg-wb-surface py-16 sm:py-24">
            <div className="mx-auto max-w-7xl px-6 lg:px-8">
                <div className="mx-auto max-w-2xl lg:mx-0 text-center">
                    <h2 className="text-5xl font-bold tracking-tight text-wb-text sm:text-6xl">{typeof journal.title === 'string' ? journal.title : ''}</h2>
                    {date && (
                        <p className="mt-4 text-base text-wb-muted">
                            <time dateTime={date.toISOString()}>{date.toLocaleDateString()}</time>
                        </p>
                    )}
                </div>
                <div className="mt-10 flex justify-center">
                    <img src={coverImage} alt="Cover" className="h-96 w-full object-cover rounded-lg shadow-md" />
                </div>
                <div className="mt-10 max-w-2xl mx-auto text-left">
                    {/* pre-line keeps the writer's line breaks and paragraph gaps */}
                    <p className="text-lg leading-8 text-wb-text whitespace-pre-line break-words">{typeof journal.article === 'string' ? journal.article : ''}</p>
                    <div className="mt-5 flex flex-wrap gap-2">
                        {journalTags(journal).map((tag, index) => (
                            <span key={index} className="inline-flex items-center rounded-full bg-wb-primary-soft px-4 py-1 text-lg font-medium text-wb-primary-hover">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default JournalDetail;
