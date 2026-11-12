import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import './MeditationTracker.css';
import Navbar from '../navbar/Navbar';
import WellnessExercises from './WellnessExercises.jsx';
import { FaPlay, FaPause, FaStop, FaMedal, FaCalendarCheck, FaFire, FaBell } from 'react-icons/fa';

const MeditationTracker = () => {
  const [sessions, setSessions] = useState([]);
  const [type, setType] = useState('mindfulness');
  const [notes, setNotes] = useState('');
  const [timer, setTimer] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [streak, setStreak] = useState(0);
  const [lastMeditationDate, setLastMeditationDate] = useState(null);
  const [selectedDuration, setSelectedDuration] = useState(5);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const navigate = useNavigate();
  const username = localStorage.getItem('tokenUser');

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }
    fetchSessions();
    // Check if there's a saved session
    const savedSession = localStorage.getItem('currentMeditationSession');
    if (savedSession) {
      const { timer: savedTimer, duration, startTime } = JSON.parse(savedSession);
      const elapsedTime = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
      if (elapsedTime < duration * 60) {
        setTimer(savedTimer + elapsedTime);
        setSelectedDuration(duration);
        setIsActive(true);
      } else {
        localStorage.removeItem('currentMeditationSession');
      }
    }
  }, []);

  useEffect(() => {
    let interval = null;
    if (isActive && !isPaused) {
      interval = setInterval(() => {
        setTimer(prevTimer => {
          if (prevTimer >= selectedDuration * 60) {
            clearInterval(interval);
            handleMeditationComplete();
            return prevTimer;
          }
          // Save current session state
          localStorage.setItem('currentMeditationSession', JSON.stringify({
            timer: prevTimer + 1,
            duration: selectedDuration,
            startTime: new Date().toISOString()
          }));
          return prevTimer + 1;
        });
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, isPaused, selectedDuration]);

  const fetchSessions = async () => {
    try {
      const response = await axios.get(`http://localhost:8000/api/meditation/sessions/${username}`);
      setSessions(response.data);
      calculateStreak(response.data);
    } catch (error) {
      console.error('Error fetching meditation sessions:', error);
    }
  };

  const calculateStreak = (meditationData) => {
    if (!meditationData.length) {
      setStreak(0);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sortedSessions = meditationData.sort((a, b) => new Date(b.date) - new Date(a.date));
    setLastMeditationDate(new Date(sortedSessions[0].date));

    let currentStreak = 0;
    let currentDate = today;
    let sessionIndex = 0;

    while (sessionIndex < sortedSessions.length) {
      const sessionDate = new Date(sortedSessions[sessionIndex].date);
      sessionDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((currentDate - sessionDate) / (1000 * 60 * 60 * 24));

      if (diffDays <= 1) {
        currentStreak++;
        currentDate = sessionDate;
        sessionIndex++;
      } else {
        break;
      }
    }

    setStreak(currentStreak);
  };

  const handleMeditationComplete = async () => {
    try {
      setIsActive(false);
      setIsPaused(false);
      localStorage.removeItem('currentMeditationSession');
      
      // Play completion sound
      const audio = new Audio('/meditation-bell.mp3');
      audio.play();
      
      setShowCompletionModal(true);
    } catch (error) {
      console.error('Error completing meditation:', error);
    }
  };

  const handleSubmitSession = async () => {
    try {
      await axios.post(`http://localhost:8000/api/meditation/add/${username}`, {
        duration: selectedDuration,
        type,
        notes,
        date: new Date()
      });
      
      setNotes('');
      setShowCompletionModal(false);
      fetchSessions();
    } catch (error) {
      console.error('Error adding meditation session:', error);
    }
  };

  const formatTime = (timeInSeconds) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    if (!username) {
      navigate('/login');
      return;
    }
    setIsActive(true);
    setIsPaused(false);
    localStorage.setItem('currentMeditationSession', JSON.stringify({
      timer: 0,
      duration: selectedDuration,
      startTime: new Date().toISOString()
    }));
  };

  const handlePause = () => {
    setIsPaused(true);
    setIsActive(false);
  };

  const handleResume = () => {
    setIsPaused(false);
    setIsActive(true);
  };

  const handleStop = () => {
    setIsActive(false);
    setIsPaused(false);
    setTimer(0);
    localStorage.removeItem('currentMeditationSession');
  };

  const handleDurationSelect = (mins) => {
    setSelectedDuration(mins);
    setTimer(0);
    setIsActive(false);
    setIsPaused(false);
    localStorage.removeItem('currentMeditationSession');
  };

  return (
    <>
      <Navbar />
      <div className="med-page min-h-screen px-4 pt-24 pb-12">
        <div className="max-w-4xl mx-auto">
          <div className="med-surface overflow-hidden">
            <div className="med-header flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <h2 className="text-xl font-semibold tracking-tight text-white">Meditation Tracker</h2>
              <div className="flex flex-wrap items-center gap-2 text-sm text-white">
                <div className="med-header-chip flex items-center gap-2">
                  <FaFire className="text-wb-accent w-4 h-4" />
                  <span>{streak} Day Streak</span>
                </div>
                {lastMeditationDate && (
                  <div className="med-header-chip flex items-center gap-2">
                    <FaCalendarCheck className="text-wb-accent w-4 h-4" />
                    <span>Last: {new Date(lastMeditationDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="med-inset mb-5 grid gap-4 p-4 sm:p-5 md:grid-cols-[auto,1fr] md:items-center md:gap-6">
                <div className="text-center md:min-w-[9rem] md:text-left">
                  <div className="med-timer text-5xl font-bold tabular-nums">
                    {formatTime(timer)}
                  </div>
                  <div className="mt-1 text-sm text-wb-muted">
                    {isActive && !isPaused ? 'Time Remaining: ' : 'Duration: '}
                    {formatTime(selectedDuration * 60 - timer)}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {[5, 10, 15, 20, 30].map((mins) => (
                      <button
                        key={mins}
                        className={`med-chip py-2 text-sm ${
                          selectedDuration === mins ? 'med-chip-active' : ''
                        } ${isActive || isPaused ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => handleDurationSelect(mins)}
                        disabled={isActive || isPaused}
                      >
                        {mins} min
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-center gap-2 md:justify-start">
                    {!isActive && !isPaused ? (
                      <button
                        className="med-btn med-btn-primary"
                        onClick={handleStart}
                      >
                        <FaPlay />
                        <span>Start</span>
                      </button>
                    ) : isPaused ? (
                      <button
                        className="med-btn med-btn-success"
                        onClick={handleResume}
                      >
                        <FaPlay />
                        <span>Resume</span>
                      </button>
                    ) : (
                      <button
                        className="med-btn med-btn-warn"
                        onClick={handlePause}
                      >
                        <FaPause />
                        <span>Pause</span>
                      </button>
                    )}
                    <button
                      className={`med-btn ${!isActive && !isPaused ? 'med-btn-muted' : 'med-btn-danger'}`}
                      onClick={handleStop}
                      disabled={!isActive && !isPaused}
                    >
                      <FaStop />
                      <span>Stop</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-wb-muted mb-1.5">Meditation Type</label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="med-field"
                  >
                    <option value="mindfulness">Mindfulness</option>
                    <option value="breathing">Breathing</option>
                    <option value="body-scan">Body Scan</option>
                    <option value="loving-kindness">Loving Kindness</option>
                    <option value="zen">Zen</option>
                    <option value="transcendental">Transcendental</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-wb-muted mb-1.5">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="How was your session? How do you feel?"
                    className="med-field h-20 resize-y"
                  />
                </div>
              </div>

              <div className="flex justify-end mb-5">
                <button
                  onClick={handleSubmitSession}
                  className="med-btn med-btn-success"
                  disabled={!selectedDuration}
                >
                  <span>Save Session</span>
                </button>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-wb-text mb-3">Your Meditation History</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sessions.map((session) => (
                    <div key={session._id} className="med-tile p-3 text-sm">
                      <div className="flex justify-between items-center mb-2">
                        <div className="text-wb-muted">
                          {new Date(session.date).toLocaleDateString()}
                        </div>
                        <div className="flex items-center font-medium text-wb-primary">
                          <FaMedal className="w-4 h-4 mr-1.5" />
                          {session.duration} minutes
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-wb-muted"><strong>Type:</strong> {session.type}</p>
                        {session.notes && (
                          <p className="text-wb-muted">
                            <strong>Notes:</strong> {session.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <WellnessExercises />
        </div>
      </div>

      {showCompletionModal && (
        <div className="med-overlay fixed inset-0 flex items-center justify-center z-50">
          <div className="med-surface p-6 sm:p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <FaBell className="w-12 h-12 text-wb-primary mx-auto mb-3" />
              <h3 className="text-xl font-semibold text-wb-text mb-2">Session Complete!</h3>
              <p className="text-wb-muted mb-5">
                Great job completing your {selectedDuration} minute meditation session.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleSubmitSession}
                  className="med-btn med-btn-success"
                >
                  Save Session
                </button>
                <button
                  onClick={() => setShowCompletionModal(false)}
                  className="med-btn med-btn-neutral"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MeditationTracker;
